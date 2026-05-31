# SWAP — Enhancement & Direction Document

> Strategic and technical roadmap for evolving SWAP from a working prototype into a fundable product.
>
> **Framing chosen:** build toward a startup; pivot boldly from *advisory* coordination to *enforced* coordination, with the **cross-file semantic impact graph** as the core defensible asset.
>
> Status of this doc: opinionated. It commits to a thesis and a sequence. Where it diverges from the original `docs/design.md`, that is intentional — the design doc described what to build first; this describes what to build *next* and *why it changes the bet*.

---

## 0. TL;DR

SWAP today is a **symbol-level lock manager** for parallel coding agents. That is a real, working system, but as a *product* it has three problems:

1. **It is advisory.** Coordination only happens if the agent remembers to call `claim_symbol` before editing. Nothing intercepts the actual `Edit`/`Write`. This is the single biggest weakness and it gets worse under load.
2. **Its headline use case is narrow.** "10 agents on one file" is a great demo but a rare real-world shape. Most fleets fan out across features.
3. **Its most valuable component is buried.** The cross-file semantic impact graph + live semantic-diff stream is useful even for a *single* agent — and it is currently the least developed part of the codebase (`extractDependencyEdges` doesn't even cross file boundaries yet).

**The pivot:** stop selling "a lock manager," start selling **"a shared semantic world-model and safety layer for fleets of coding agents"** — one that *enforces* coordination by intercepting edits through Claude Code hooks, and whose moat is a *cross-repo, cross-file impact graph* that no single agent's context window can hold.

The lock manager becomes one feature of a coordination + observability + governance control plane.

---

## 1. Honest assessment of the current codebase

### 1.1 What is genuinely strong

| Asset | Where | Why it matters |
|---|---|---|
| Symbol-level readers-writer lock | `server/intent.ts` | Correct granularity decision; file-level locks would serialize everything. |
| Priority negotiation w/ 5 factors | `server/negotiate.ts` | Novel, working conflict-resolution mechanism. Most systems just reject or queue. |
| Tree-sitter symbol + edge extraction | `parser/symbol-extractor.ts` | Real AST understanding, not regex. Foundation for everything semantic. |
| Snapshot-based semantic diff | `parser/diff.ts` | Distinguishes `SIGNATURE_CHANGED` (breaking) from `BODY_CHANGED` (safe) — the right abstraction. |
| MCP adapter, zero prompt-eng | `mcp/server.ts` + `CLAUDE.md` | Agents pick up the protocol natively. Good distribution mechanism. |
| Monitoring dashboard | `dashboard/` | The seed of a control plane — already the most "product-shaped" surface. |

### 1.2 What undercuts the current bet (be brutally honest with yourself)

1. **Voluntary protocol / no enforcement.** `server/index.ts` only knows what the agent *tells* it. An agent that edits `createOrder` without claiming it produces exactly the silent corruption SWAP exists to prevent. This is the existential flaw. *Everything in the bold roadmap follows from fixing it.*

2. **Cross-file dependencies are not tracked.** In `symbol-extractor.ts`:
   ```ts
   // Only add edges to symbols we know about in this file
   if (!symbolNames.has(referencedName)) continue;
   ```
   The motivating scenario in `docs/design.md` (§1) — `login()` calling `authenticate()` across files — is the case the implementation drops. The impact graph is currently intra-file only. **This is the gap that, once closed, becomes the moat.**

3. **`release_symbol` ships the entire file as `newSource`.** Token-expensive, and the snapshot is whatever the agent *claims* the file is, not what's on disk. The server has no ground truth.

4. **No persistence.** `docs/design.md` §10 promises disk checkpoints and reconnect recovery; the implementation is fully in-memory. A server restart loses all coordination state.

5. **Negotiation is self-reported and game-able.** `NEGOTIATE` priority comes from the agent. A "selfish" agent wins by claiming `priority: 1.0`. The server-side `computePriority` exists but is only used as a timeout fallback.

6. **Semantic diff is shallow.** `parseSignature` is a stub (`params: []`); `RENAMED`/`MOVED` are declared but not detected; signature comparison is string equality.

7. **No auth / multi-tenancy / hosting story.** Fine for `localhost:7700`; nonexistent for a product.

> **None of this means the project is weak.** It means you've validated the hard core (symbol locks, negotiation, semantic diff) and the *next* dollar of effort should go into enforcement + cross-file graph + control plane, not into more lock-model polish.

---

## 2. The strategic thesis

### 2.1 The market reality (as of 2026)

- Running **many coding agents in parallel** has gone mainstream: Claude Code subagents + worktrees, Conductor, Cursor background agents, Devin, OpenHands, and a long tail of internal fleets.
- The bottleneck has shifted from "can an agent write code" to **"can I trust a swarm of agents not to corrupt my codebase, and can I see/govern what they're doing."**
- Today this is solved with **manual task decomposition** (slow, error-prone) and **post-hoc merge review** (brittle, late). That's the wedge.

### 2.2 The reframed product

> **SWAP is the coordination and safety control plane for fleets of coding agents.**

Three layers, in increasing defensibility:

```
┌──────────────────────────────────────────────────────────────┐
│  3. GOVERNANCE & OBSERVABILITY  (the business / enterprise $)  │
│     fleet dashboard · audit log · policy · replay · approval  │
├──────────────────────────────────────────────────────────────┤
│  2. SEMANTIC IMPACT GRAPH       (the moat / hard tech)        │
│     cross-file, cross-repo dependency + impact analysis       │
├──────────────────────────────────────────────────────────────┤
│  1. ENFORCED COORDINATION       (the wedge / table stakes)    │
│     hooks intercept edits → claim/negotiate/diff automatically │
└──────────────────────────────────────────────────────────────┘
```

Layer 1 gets you in the door (it *just works*, no agent discipline required). Layer 2 is the thing competitors can't trivially copy. Layer 3 is what enterprises pay for.

### 2.3 The one-sentence pitch

*"Run 50 coding agents on your monorepo and merge with confidence — SWAP intercepts every edit, prevents semantic collisions before they happen, and gives you a live map of who changed what and what it breaks."*

---

## 3. THE BOLD PIVOT — enforced coordination via hooks

This is the highest-leverage change in the entire document. Read it twice.

### 3.1 The problem with advisory coordination

The current loop depends on the agent executing 6 steps **every turn, correctly, forever**:

```
list_agents → broadcast_intent → claim_symbol → edit → release_symbol → get_peer_context
```

LLMs don't do this reliably. The first time an agent skips `claim_symbol` and edits anyway, SWAP is blind — and that's precisely the moment a collision occurs.

### 3.2 The fix: intercept at the tool boundary

Claude Code exposes **hooks** (`PreToolUse`, `PostToolUse`) that fire on tool calls *regardless of what the model decided to do*. This is the enforcement primitive SWAP is missing.

```
        Agent decides to Edit("platform.ts", createOrder)
                          │
                ┌─────────▼──────────┐
   PreToolUse  │  swap-hook (intercept)│  ── claim createOrder on SWAP server
     hook       └─────────┬──────────┘      ├─ GRANTED  → allow the Edit
                          │                  └─ CONFLICT → block + return reason to agent
                ┌─────────▼──────────┐
                │    Edit executes    │
                └─────────┬──────────┘
   PostToolUse │  swap-hook (commit) │  ── release + push REAL file from disk → semantic diff
     hook       └────────────────────┘
```

**Why this is transformative:**

- Coordination no longer depends on agent discipline — it's structural.
- The `PreToolUse` hook can **deny** the tool call (exit code / decision) and feed the agent the conflict reason, turning "silent corruption" into "the agent is told *why* it can't edit and what to do instead."
- The `PostToolUse` hook reads the **real file from disk** — eliminating the `newSource`-from-the-agent trust problem entirely. The server finally has ground truth.
- It works even for agents that have *never heard of SWAP*. Distribution becomes "add one hook," not "teach the protocol in CLAUDE.md."

### 3.3 Concrete engineering

- New package `swap/hooks/` with a thin CLI: `swap-hook pre` and `swap-hook post`, reading the hook JSON payload from stdin (tool name, args, file path).
- `pre` maps `Edit`/`Write`/`MultiEdit` → resolve which **symbol(s)** the edit touches (use byte range of the edit vs. the symbol table from `symbol-extractor.ts`), then `CLAIM` synchronously over a local unix socket / ws. Block if conflict.
- `post` re-reads the file from disk, calls the existing `SnapshotStore.diff()` path, and `RELEASE`s with real source.
- Keep the MCP tools too — they become the *deliberate* coordination layer (broadcast_intent, get_peer_context) on top of the *automatic* one.

> **Design decision to make:** should a `PreToolUse` conflict **hard-block** the edit (strict mode, safest) or **warn-and-allow** (advisory mode, less friction)? Recommendation: ship both as a policy flag; default to warn-and-allow for adoption, let enterprises set strict. This becomes a Layer-3 policy knob.

### 3.4 What this unlocks

Once edits are intercepted, SWAP sees the *true* edit stream of the whole fleet. That stream is the raw material for everything in Layers 2 and 3 — the impact graph, the audit log, replay, and policy enforcement all become possible *only because* you moved from advisory to enforced.

---

## 4. THE MOAT — cross-file / cross-repo semantic impact graph

### 4.1 Why this is the defensible asset

A single agent's context window cannot hold a 2M-line monorepo's dependency structure. A **persistent, incrementally-updated, cross-file impact graph** is something:

- valuable to a **single** agent (answer "what breaks if I change this signature?" before it edits — i.e. impact analysis as a service), and
- valuable to a **fleet** (route tasks to avoid collisions, predict conflicts *before* claims).

It compounds: the more edits flow through SWAP, the richer and more accurate the graph. That's a data moat, not just a code moat.

### 4.2 What to build (closing the gap in `symbol-extractor.ts`)

1. **Cross-file symbol resolution.** Replace the intra-file-only edge filter with an *import-aware resolver*: parse `import` statements, build a module-path → file map, resolve `referencedName` to its defining file. Edges become `from: fileA::login → to: fileB::authenticate`.
2. **Whole-repo indexing pass.** A `swap index <repo>` command that walks the tree, extracts every symbol + edge, and builds the initial graph (today the graph is only populated lazily on `RELEASE`). This is the cold-start.
3. **Incremental update.** Each enforced edit (from §3) updates only the affected file's edges — keep it O(changed files), not O(repo).
4. **Impact query API + MCP tool.** New tool `impact_of(symbol)` → transitive dependents across files, ranked. The single most useful thing you can give *any* agent.
5. **Breaking-change propagation.** When a `SIGNATURE_CHANGED` diff lands, walk the cross-file graph and proactively notify *every* agent whose claimed symbols are downstream — not just same-file peers.

### 4.3 Multi-language as graph breadth

`docs/design.md` §11 lists Python/Go/Rust as future phases. Under the moat framing, language coverage isn't a checkbox — **each language is more graph surface**. Prioritize by where fleets actually run: TypeScript/JS (done) → Python → Go. Tree-sitter makes each addition a query file (`parser/languages/<lang>.ts`) plus a resolver for that language's import semantics.

---

## 5. THE BUSINESS SURFACE — observability & governance

The `dashboard/` is your most product-shaped artifact. Grow it from "demo monitor" into a **control plane**.

### 5.1 Features, in order of enterprise willingness-to-pay

1. **Live fleet view** (have the seed): agents, claims, negotiations, semantic diffs. Add: the impact graph as an interactive map; collisions highlighted *before* they merge.
2. **Audit log** (high value): immutable record of every claim, negotiation outcome, and edit, attributable to an agent + task. "Which agent changed `chargeCard` and why?" Enterprises *need* this for AI-generated code.
3. **Replay / timeline**: scrub the fleet's history; see how the codebase state evolved. Debugging + trust.
4. **Policy engine**: "no agent may edit `payments/*` without strict-mode claims"; "signature changes to exported symbols require human approval." This is where §3's strict/advisory flag becomes a real product.
5. **Human-in-the-loop approval queue**: breaking changes / high-impact edits pause for a human. This is the bridge between "autonomous fleet" and "I trust it in production."

### 5.2 Why governance is the wedge into revenue

Individuals will use enforced coordination for free (open-source it — it drives adoption). **Teams pay for visibility, audit, and control** over fleets they can't personally watch. The buyer is a platform/eng-lead running >5 agents on a shared codebase.

---

## 6. Phased roadmap

Each phase is shippable and de-risks the next. Tied to actual files.

### Phase A — Enforcement (the unlock) · ~2–3 weeks
- [ ] `swap/hooks/` CLI (`pre`/`post`), reads Claude Code hook payloads.
- [ ] Edit-range → symbol resolution using `symbol-extractor.ts` byte ranges.
- [ ] `PreToolUse` synchronous claim w/ block-on-conflict; `PostToolUse` release reading real disk source.
- [ ] Strict vs. advisory policy flag in `shared/constants.ts`.
- [ ] Demo: an agent that *doesn't* know SWAP exists still gets coordinated.
- **Proof point:** reproduce the `createOrder` collision from the README and show it blocked automatically with no `claim_symbol` call.

### Phase B — Cross-file impact graph (the moat) · ~3–4 weeks
- [ ] Import-aware cross-file edge resolution in `symbol-extractor.ts`.
- [ ] `swap index <repo>` whole-repo cold-start indexing.
- [ ] `impact_of` MCP tool + server query path in `server/graph.ts`.
- [ ] Cross-file breaking-change propagation in the `RELEASE` handler (`server/index.ts`).
- **Proof point:** change a function signature in file A; every agent working downstream in files B/C/D is notified before they merge.

### Phase C — Persistence & robustness · ~2 weeks
- [ ] Disk checkpoint of claims + graph (deliver on `design.md` §10).
- [ ] Reconnect with claim restoration; server-crash recovery.
- [ ] Server-authoritative negotiation (use `computePriority` as the real arbiter; treat agent self-report as *one input*, capped, to kill gaming).
- [ ] Real signature parsing in `parser/diff.ts` (fill the `parseSignature` stub; detect `RENAMED`/`MOVED`).

### Phase D — Control plane / SaaS · ~4–6 weeks
- [ ] Audit log (append-only store) + dashboard view.
- [ ] Replay/timeline.
- [ ] Auth + multi-tenant server (move beyond bare `localhost:7700`).
- [ ] Policy engine + human approval queue.
- **Proof point:** a team lead watches 10 agents on a shared repo, gets an alert on a payments-path breaking change, approves/rejects from the dashboard.

### Phase E — Breadth · ongoing
- [ ] Python, then Go language support (query + import resolver per language).
- [ ] Editor-agnostic: a generic hook/proxy so non-Claude agents (Cursor, Devin, OpenHands) can participate.

---

## 7. Defensibility / moat analysis

| Layer | How easily copied | Moat type |
|---|---|---|
| Enforced coordination (hooks) | Easy to copy mechanically | **Distribution / first-mover.** Become the default people install. |
| Symbol locks + negotiation | Medium | Protocol design lead-time. |
| Cross-file/repo impact graph | **Hard** | **Tech + data moat.** Improves with usage; multi-language is years of surface. |
| Governance / audit / policy | Medium | **Enterprise switching cost.** Once it's the system of record for "who changed what," you're sticky. |

**The real moat is the combination:** enforcement gives you the *complete* edit stream → that stream feeds an ever-better impact graph → the graph + audit log become the system of record teams build process around. Each layer makes the next harder to dislodge.

**The risk to the moat:** Anthropic/Cursor could fold basic coordination into their platforms. Defense — go *deeper* (cross-repo graph, governance, multi-vendor) than any single agent vendor will bother to, and stay **agent-agnostic** (the Switzerland of agent fleets) so you're valuable precisely *because* you span vendors.

---

## 8. Competitive landscape & positioning

- **Conductor / worktree orchestrators:** solve spawning + physical isolation. SWAP is *complementary* — it's the semantic layer above them. Partner, don't fight. (`design.md` §12 already imagines this.)
- **Cursor background agents / Claude Code subagents:** single-vendor, single-machine coordination at best. SWAP's wedge: cross-vendor, fleet-scale, with a persistent graph + governance.
- **Merge tools (git, Graphite, etc.):** act *after* the conflict exists. SWAP acts *before* the edit. Different point in the lifecycle; you can integrate (export semantic-diff metadata into their PR view).
- **CI/static analysis:** catches breakage post-commit. SWAP catches it pre-edit and routes around it.

**Positioning line:** *"Worktrees stop agents from overwriting bytes. SWAP stops them from overwriting meaning — and shows you the whole fleet while it happens."*

---

## 9. Business model (sketch)

- **Open-source core:** enforced coordination + local dashboard. Drives adoption; becomes the default install. (This is your distribution.)
- **Team/Cloud (paid):** hosted multi-tenant server, audit log, replay, policy engine, approval queue, cross-repo graph. Seat- or fleet-based pricing.
- **Enterprise:** SSO, on-prem, compliance/audit exports, SLAs.

The free tier must be genuinely useful solo (impact analysis for a single agent is the hook). The paid tier sells *trust at fleet scale*.

---

## 10. Go-to-market wedge

1. **Land:** the open-source hook — "one line to make your parallel agents stop corrupting each other." Aim it at the people already running Conductor / multi-worktree setups (they feel the pain *today*).
2. **Expand:** the impact graph / `impact_of` tool gets used even by solo agent users → broad top-of-funnel.
3. **Monetize:** the moment a team runs >5 agents on a shared repo, they need the dashboard + audit + policy. That's the upgrade trigger.

Killer demo to build first: *the same `createOrder` collision the README describes, but with two agents that never call `claim_symbol` — SWAP intercepts via hooks, blocks the second edit, explains why, and the merge is clean.* That single GIF is your whole pitch.

---

## 11. Risks & how to de-risk

| Risk | Severity | De-risk |
|---|---|---|
| "Many agents on one repo" stays a niche workflow | High | Make Layer 2 (impact graph) valuable to *single* agents so you don't depend on swarm adoption. |
| Platform vendors absorb coordination | High | Go deeper (cross-repo, governance) + stay vendor-agnostic. |
| Hook latency slows agents | Medium | `PreToolUse` claim must be sub-100ms; local socket, in-memory hot path, async the heavy graph work. |
| Cross-file resolution is hard in dynamic langs | Medium | Start with statically-resolvable TS/Go; treat Python imports best-effort; degrade gracefully. |
| Agents fight the blocker (retry loops) | Medium | `DEFER` with a concrete alternative (already in `server/index.ts`); cap retries; surface to human queue. |

---

## 12. Metrics that prove the thesis

Instrument these from day one — they're also your pitch deck:

- **Collision-prevention rate:** edits blocked pre-conflict ÷ edits that *would* have collided (measure against an advisory-only baseline).
- **Semantic-merge-conflict reduction:** merge conflicts / breaking changes per N agent-hours, SWAP-on vs. SWAP-off.
- **Impact-graph accuracy:** predicted downstream breakages vs. actual (precision/recall).
- **Coordination overhead:** added latency per edit (must stay low).
- **Fleet scale:** max concurrent agents on one repo before incoherence — push this number; it's the headline.

---

## 13. 30 / 60 / 90

- **30 days:** Phase A done. The hooks demo (collision blocked with zero agent cooperation) recorded. This validates the whole pivot.
- **60 days:** Phase B's cross-file impact graph + `impact_of`. Now you have the moat in nascent form and a single-agent value prop.
- **90 days:** Phase C robustness + the start of the audit log. Enough to put in front of a design-partner team running a real fleet.

---

## 14. What NOT to do

- Don't keep polishing the lock model / negotiation weights — that's solved enough; marginal returns.
- Don't chase 8 languages before the cross-file graph works in one.
- Don't build the SaaS billing/multi-tenant layer before you've proven collision-prevention with a design partner.
- Don't abandon MCP — it's still the *deliberate* coordination surface and your distribution channel. Hooks *complement* it; they don't replace it.

---

## Appendix A — Mapping enhancements to existing files

| Enhancement | Touches |
|---|---|
| Hook enforcement | new `swap/hooks/`, `server/intent.ts`, `server/index.ts`, `shared/constants.ts` |
| Edit-range → symbol resolution | `parser/symbol-extractor.ts` (byte-range lookup) |
| Cross-file graph | `parser/symbol-extractor.ts`, `server/graph.ts`, `server/index.ts` (RELEASE handler) |
| Whole-repo index | new `swap/index/` command |
| Server-authoritative negotiation | `server/negotiate.ts` |
| Real signature diffing | `parser/diff.ts` (`parseSignature`, RENAMED/MOVED) |
| Persistence | `server/registry.ts`, `server/intent.ts`, new checkpoint store |
| Control plane | `dashboard/` (audit, replay, policy, approval views) |
| Multi-language | `parser/languages/python.ts`, `parser/languages/go.ts` + import resolvers |

## Appendix B — Open design decisions to resolve

1. **Strict vs. advisory default** for hook blocking (recommend: advisory default, strict opt-in).
2. **Transport for hooks** — local unix socket vs. reuse the ws server (recommend: socket for latency).
3. **Negotiation trust model** — how much weight to give agent self-reported priority once the server can compute its own (recommend: cap self-report's influence to prevent gaming).
4. **Graph staleness policy** — how to handle edits that bypass hooks (manual git operations) so the graph doesn't drift from disk.
