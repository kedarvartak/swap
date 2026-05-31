# SWAP 2.0 — Implementation Phases

> Continuation of `docs/phases.md`. That document delivered Phases 1–3 (server + registry, intent registry + conflict detection, negotiation + semantic diff streaming) — all shipped. **This document defines the next-generation roadmap** that turns SWAP from an *advisory lock manager* into an *enforced coordination + impact-analysis + governance control plane*.
>
> Strategy context lives in `enhancement.md` (repo root). This file is the buildable breakdown of that strategy.
>
> Phases are lettered **A–E** to distinguish them from the shipped numeric phases. Each phase ships something runnable. The whole roadmap is sequenced so each phase de-risks the next.

---

## Overview

| Phase | Theme | Why it exists | Ships |
|---|---|---|---|
| **A** | Enforcement via hooks | Coordination must not depend on the agent remembering to claim | Edits auto-claim/auto-release through Claude Code hooks |
| **B** | Cross-file impact graph | The defensible moat; valuable even to a single agent | `impact_of` + cross-file breaking-change propagation |
| **C** | Persistence & robustness | A product can't lose all state on restart | Disk checkpoints, reconnect recovery, server-authoritative negotiation |
| **D** | Control plane / SaaS | The thing teams pay for | Audit log, replay, auth/multi-tenant, policy engine, approval queue |
| **E** | Breadth | More languages + more agent vendors = bigger TAM | Python/Go support, agent-agnostic proxy |

**Guiding principle (unchanged from 1.0):** no phase ends with half-built infrastructure. Each phase has a single headline proof point that you could put in a demo or a deck.

---

## Phase A — Enforced Coordination via Hooks

**Goal:** An agent that *never calls `claim_symbol`* still gets coordinated. Coordination becomes structural, not behavioral.

**Outcome:** Every `Edit`/`Write`/`MultiEdit` an agent makes is intercepted: the system claims the affected symbol(s) *before* the write lands, blocks (or warns) on conflict, and releases with the *real on-disk source* after the write.

**Headline proof point:** Reproduce the `createOrder` collision from the README with two agents whose prompts say nothing about SWAP — and show the second edit blocked automatically, with a human-readable reason returned to the agent.

### Tasks

#### A.1 Hook CLI scaffold
- [ ] New package dir `swap/hooks/`
- [ ] `swap/hooks/cli.ts` — entrypoint with two subcommands: `pre` and `post`
- [ ] Read the Claude Code hook event JSON from **stdin** (contains `tool_name`, `tool_input`, `cwd`, session id)
- [ ] Resolve config: `SWAP_SERVER_URL`, worktree path, agent identity (reuse env vars from `mcp/server.ts`)
- [ ] Add `bin` entries to `swap/package.json` so `swap-hook` is invocable
- [ ] Decide transport: **local unix domain socket** for sub-100ms latency (fallback to `ws://localhost:7700` if socket unavailable). Document the choice in `shared/constants.ts`.

#### A.2 Edit-range → symbol resolution
- [ ] `swap/hooks/resolve.ts` — given `(filePath, editRange | oldString)`, determine which symbol(s) the edit lands inside
- [ ] Reuse `extractFull()` from `parser/symbol-extractor.ts` to get the current symbol table (with `startByte`/`endByte`)
- [ ] For `Edit`/`MultiEdit`: locate `oldString` byte offset(s) in the file → map to enclosing symbol via the same logic as `findEnclosingSymbol()`
- [ ] For `Write` (whole-file): diff old vs new content, claim every symbol whose byte range changed
- [ ] Edge cases: edit spans multiple symbols (claim all), edit outside any symbol (top-level / imports — claim a synthetic `<file>` symbol), new file (no prior symbols — allow)

#### A.3 PreToolUse — synchronous claim + block
- [ ] `swap/hooks/pre.ts` — for each resolved symbol, send `CLAIM` and await `CLAIM_GRANTED` / `CLAIM_CONFLICT`
- [ ] On all granted → emit hook "allow" decision (exit 0)
- [ ] On any conflict → emit hook "deny" decision with the conflict reason + `suggestion` text in the message the agent sees (so the agent self-corrects)
- [ ] Latency budget: claim round-trip must stay **< 100ms**; the heavy graph/diff work stays off this path
- [ ] Reuse the existing negotiation flow in `server/index.ts` — a hook-driven claim that conflicts should trigger the *same* `NEGOTIATE` path as an MCP claim
- [ ] Timeout safety: if the SWAP server is unreachable, **fail open** (allow the edit) so SWAP never bricks an agent — log a warning

#### A.4 PostToolUse — release with real disk source
- [ ] `swap/hooks/post.ts` — after the tool runs, **re-read the file from disk** (ground truth, not agent-supplied `newSource`)
- [ ] Send `RELEASE` with the real source → server runs existing `SnapshotStore.diff()` + graph update + `PEER_DIFF` broadcast
- [ ] This eliminates the `newSource`-from-agent trust gap entirely
- [ ] Handle partial failures (tool errored / file unchanged): release the claim without emitting a diff

#### A.5 Strict vs. advisory policy
- [ ] Add `COORDINATION_MODE: 'strict' | 'advisory'` to `shared/constants.ts` (default `advisory`)
- [ ] `advisory`: `PreToolUse` conflict → warn the agent but allow the edit (records the conflict for the dashboard)
- [ ] `strict`: `PreToolUse` conflict → hard-deny the edit until the claim is grantable
- [ ] Per-path overrides (e.g. `payments/*` is always strict) — design the config shape now; full policy engine lands in Phase D
- [ ] Server records every conflict + decision regardless of mode (feeds Phase D audit log)

#### A.6 Install ergonomics
- [ ] `swap/hooks/settings.template.json` — the Claude Code `settings.json` hook config snippet (`PreToolUse`/`PostToolUse` matchers for `Edit|Write|MultiEdit`)
- [ ] Extend the `swap` CLI launcher: `swap start <id>` should inject the hook config automatically (alongside the existing MCP config)
- [ ] One-command install for an *existing* project: `swap install` writes the hook block into the project's `.claude/settings.json`
- [ ] Keep the MCP tools — they remain the *deliberate* layer (`broadcast_intent`, `get_peer_context`, `impact_of`). Hooks are the *automatic* layer. Document the two-layer model in `CLAUDE.md`.

#### A.7 Phase A test
- [ ] `swap/scripts/test-phaseA.sh`
- [ ] Two agents, prompts mention nothing about SWAP, both told to edit `createOrder` in the fixture
- [ ] Assert: server logs show two auto-claims, one grant + one conflict/negotiation, with **zero** `claim_symbol` tool calls in the agent transcripts
- [ ] Assert (strict mode): the losing edit is blocked and the agent receives the reason
- [ ] Assert (advisory mode): both edits land but the conflict is recorded
- [ ] Measure and record `PreToolUse` claim latency distribution

**Phase A exit criteria:** A SWAP-naive agent is coordinated purely through hooks. The README collision is prevented with no agent cooperation, latency stays under budget, and an unreachable server fails open.

---

## Phase B — Cross-File / Cross-Repo Semantic Impact Graph

**Goal:** Close the single biggest gap between the design doc and the implementation — track dependencies *across files*, not just within one — and expose impact analysis as a first-class capability.

**Outcome:** When a signature changes in file A, every agent working downstream in files B/C/D is notified *before* they merge. A single agent can ask "what breaks if I change this?" and get an answer the codebase is too big to fit in its context.

**Headline proof point:** Agent edits `authenticate()` signature in `UserService.ts`; an agent claiming `login()` in a *different* file immediately receives a breaking-change `PEER_DIFF` listing it as affected.

### Tasks

#### B.1 Remove the intra-file edge limitation
- [ ] In `parser/symbol-extractor.ts`, the current guard drops cross-file edges:
  ```ts
  // Only add edges to symbols we know about in this file
  if (!symbolNames.has(referencedName)) continue;
  ```
  Replace with an **import-aware resolver** that can point an edge at a symbol in another file.

#### B.2 Module / import resolution
- [ ] `parser/resolve-imports.ts` — parse `import` statements, build a `moduleSpecifier → absoluteFilePath` map
- [ ] Resolve relative imports against the worktree root; respect `tsconfig.json` `paths`/`baseUrl` for alias imports
- [ ] Map an imported identifier → its defining `filePath::symbolName`
- [ ] Edges become cross-file: `fileA::login → fileB::authenticate` (kind `call`), plus `import` edges at file granularity
- [ ] Handle re-exports (`export { x } from './y'`) and namespace imports best-effort; degrade gracefully when unresolvable

#### B.3 Whole-repo cold-start index
- [ ] New command `swap index <repo>` (`swap/index/build.ts`)
- [ ] Walk the tree (respect `.gitignore`), extract symbols + edges for every supported file, populate `DependencyGraph`
- [ ] Today the graph only fills lazily on `RELEASE`; this gives a complete graph from the first edit
- [ ] Persist the index (ties into Phase C) so re-indexing is incremental
- [ ] Report stats: files indexed, symbols, edges, unresolved references

#### B.4 Incremental graph maintenance
- [ ] On each enforced edit (Phase A `PostToolUse`), re-extract only the changed file and update its outgoing edges — O(changed files), not O(repo)
- [ ] Invalidate/recompute reverse edges for symbols whose definitions moved or were renamed
- [ ] `server/graph.ts`: add `replaceFileEdges(filePath, edges)` so a file's edges can be atomically swapped (current `updateFromEdges` only adds)

#### B.5 Impact query API + MCP tool
- [ ] `server/graph.ts`: `getImpact(symbolKey)` → ranked transitive dependents across files (rank by depth + dependent count)
- [ ] New MCP tool `impact_of` in `mcp/server.ts` + schema in `mcp/schema.ts`:
  - input: `{ filePath, symbolName }`
  - output: ranked list of `{ filePath, symbolName, distance, kind }` + a human summary
- [ ] This is the single most useful thing SWAP can give *any* agent — make its description in the tool list sell that.

#### B.6 Cross-file breaking-change propagation
- [ ] In the `RELEASE` handler (`server/index.ts`), when a `SIGNATURE_CHANGED`/`DELETED`/`RENAMED` change lands, walk the **cross-file** graph
- [ ] Notify every agent whose *claimed* symbols are downstream of the change — not just same-file peers (current behavior)
- [ ] Add a directed `PEER_DIFF` variant or an `IMPACT_ALERT` message carrying: changed symbol, the recipient's affected symbol, the dependency path
- [ ] Recipient agents surface this via `get_peer_context`

#### B.7 Phase B test
- [ ] `swap/scripts/test-phaseB.sh`
- [ ] Fixture spanning ≥3 files with cross-file calls (extend `demo/fixture/`)
- [ ] Assert `swap index` builds a graph containing a known cross-file edge
- [ ] Assert `impact_of(authenticate)` lists `login` from another file
- [ ] Assert a signature change to `authenticate` produces a breaking `IMPACT_ALERT` to the agent holding `login`

**Phase B exit criteria:** The cross-file graph is real and queryable, cold-start indexing works on a multi-file repo, and breaking changes propagate across file boundaries to the right agents.

---

## Phase C — Persistence & Robustness

**Goal:** Deliver the durability `docs/design.md` §10 promised but the prototype never implemented, and harden the parts that are currently shallow or game-able.

**Outcome:** SWAP survives restarts, reconnections, and adversarial agents. State is no longer purely in-memory.

**Headline proof point:** Kill the server mid-session; restart it; agents reconnect and their claims + the impact graph are restored.

### Tasks

#### C.1 Claim & graph persistence
- [ ] Checkpoint store (`server/persist.ts`) — periodic snapshot of `IntentRegistry` claims + `DependencyGraph` to disk (JSON or SQLite)
- [ ] Write on a debounced interval and on graceful shutdown
- [ ] On boot: load checkpoint, mark all agents `disconnected`, start a grace timer before expiring orphaned claims
- [ ] Choose store: start with a single JSON file; migrate to SQLite if the graph grows large (document the threshold)

#### C.2 Reconnect & recovery
- [ ] MCP client (`mcp/server.ts`) + hook client: on disconnect, exponential backoff is already present — add **re-registration with the same agent identity**
- [ ] Server: on re-register from a known agent, restore its prior claims instead of treating it as new; broadcast `AGENT_RECONNECTED` (not `AGENT_JOINED`)
- [ ] Post-restart: claims from still-disconnected agents expire after a configurable grace window

#### C.3 Server-authoritative negotiation (anti-gaming)
- [ ] Today `NEGOTIATE` priority is agent-self-reported and only `computePriority` runs as a timeout fallback (`server/negotiate.ts`)
- [ ] Change arbitration to use the **server-computed** `computePriority` as the primary signal; treat the agent's self-reported number as one *capped* input (e.g. it can adjust the server score by at most ±0.15)
- [ ] Keep the justification string for the audit log, but it no longer solely decides the winner
- [ ] Re-tune the 5-factor weights against recorded real negotiations

#### C.4 Real signature diffing
- [ ] `parser/diff.ts`: replace the `parseSignature` stub (currently `params: []`) with a real parse of parameter names/types + return type from the tree-sitter node
- [ ] Detect `RENAMED` (symbol disappears + structurally-similar symbol appears; Levenshtein on name + same kind + similar body) and `MOVED` (same symbol now in a different file — needs the cross-file index from Phase B)
- [ ] Make `breakingChange` precise: an *added optional* param is non-breaking; an added required param is breaking

#### C.5 Phase C test
- [ ] `swap/scripts/test-phaseC.sh`
- [ ] Mid-session server kill → restart → assert claims + graph restored, agents reconnect
- [ ] Adversarial agent sends `priority: 1.0` for a trivial task → assert it does **not** automatically win against a high-criticality competitor
- [ ] Assert signature diff distinguishes optional-param-add (non-breaking) from required-param-add (breaking)

**Phase C exit criteria:** State persists across restarts, agents recover their claims on reconnect, negotiation can't be trivially gamed, and semantic diffs are accurate at the signature level.

---

## Phase D — Control Plane / SaaS

**Goal:** Build the surface teams actually pay for — visibility, audit, and control over fleets they can't personally watch. Grow `dashboard/` from a demo monitor into a control plane.

**Outcome:** A team lead can watch a live fleet, audit every agent action, replay history, set policy, and approve/reject high-impact changes.

**Headline proof point:** A lead watches 10 agents on a shared repo, gets alerted to a breaking change on the payments path, and approves/rejects it from the dashboard — and that decision is recorded immutably.

### Tasks

#### D.1 Audit log (system of record)
- [ ] Append-only event store (`server/audit.ts`) capturing every claim, negotiation outcome, edit, release, and policy decision — attributed to `agentId` + `taskDescription` + timestamp
- [ ] Query API: filter by agent, file, symbol, time range, change type
- [ ] Dashboard view: searchable audit table ("which agent changed `chargeCard` and why?")
- [ ] Export (JSON/CSV) for compliance

#### D.2 Replay / timeline
- [ ] Reconstruct fleet state at any point in time from the audit log
- [ ] Dashboard: scrubber to replay how the codebase + claims evolved over a session
- [ ] Useful for debugging "how did we get here" and for building trust

#### D.3 Auth & multi-tenancy
- [ ] Move beyond bare `localhost:7700`: token-based auth on agent connections
- [ ] Tenant isolation (a fleet/workspace boundary) so a hosted server can serve multiple teams
- [ ] Connection authz: an agent registers with a workspace token; the server scopes its view to that workspace
- [ ] Keep a zero-config local mode for the OSS/solo path

#### D.4 Policy engine
- [ ] Declarative policy file (`swap.policy.json`): per-path/per-symbol rules
  - e.g. `payments/*` → strict mode; signature changes to exported symbols → require approval
- [ ] Server evaluates policy at claim time and at diff time
- [ ] Generalizes the strict/advisory flag from Phase A into real, path-scoped governance

#### D.5 Human-in-the-loop approval queue
- [ ] High-impact / policy-flagged changes pause and enter an approval queue
- [ ] Dashboard: approve/reject with a comment; decision is recorded in the audit log
- [ ] Blocked agent receives a `DEFER`-style message and a concrete alternative while it waits
- [ ] This is the bridge between "autonomous fleet" and "trusted in production"

#### D.6 Phase D test
- [ ] `swap/scripts/test-phaseD.sh`
- [ ] Assert every claim/negotiation/release appears in the audit log with correct attribution
- [ ] Assert a payments-path signature change triggers the approval queue under policy
- [ ] Assert reject blocks the change; approve lets it proceed; both are logged
- [ ] Assert two workspaces on one server cannot see each other's agents

**Phase D exit criteria:** SWAP is the system of record for "who changed what" on a fleet, policy is enforceable per-path, and humans can govern high-impact changes from the dashboard.

---

## Phase E — Breadth (Languages + Agent-Agnostic)

**Goal:** Expand the moat surface (more languages = more graph) and the TAM (more agent vendors can participate, not just Claude Code).

**Outcome:** SWAP coordinates fleets across Python and Go codebases, and across agents that aren't Claude Code.

**Headline proof point:** A mixed fleet (a Claude Code agent + a non-Claude agent) coordinates on a Python repo through SWAP.

### Tasks

#### E.1 Python support
- [ ] `parser/languages/python.ts` — tree-sitter query for functions, methods, classes, decorators
- [ ] Python import resolver (`import`, `from ... import`, package/module path → file) in the Phase B resolver framework
- [ ] Signature extraction for Python (params, defaults, type hints, return annotation)
- [ ] Add Python fixtures + extend `swap index` to handle `.py`

#### E.2 Go support
- [ ] `parser/languages/go.ts` — query for funcs, methods, structs, interfaces
- [ ] Go import/package resolution (package path → files)
- [ ] Signature extraction for Go
- [ ] Go fixtures + indexing

#### E.3 Agent-agnostic participation
- [ ] Define a minimal **non-MCP integration contract**: a generic hook/proxy or a thin HTTP/socket shim that any agent runner can call to claim/release/query impact
- [ ] Document how Cursor background agents / Devin / OpenHands could participate via the proxy
- [ ] Position SWAP as the vendor-neutral coordination layer (the "Switzerland of agent fleets") — this is the defense against any single vendor folding coordination into their product

#### E.4 Phase E test
- [ ] `swap/scripts/test-phaseE.sh`
- [ ] Assert Python and Go fixtures index correctly (symbols + cross-file edges)
- [ ] Assert a non-Claude client can claim/release via the proxy contract
- [ ] Assert a mixed-vendor fleet coordinates on a shared repo

**Phase E exit criteria:** SWAP works on Python and Go repos with cross-file impact, and at least one non-Claude agent can coordinate through it.

---

## Timeline Estimate

| Phase | Scope | Estimate |
|---|---|---|
| A | Enforcement via hooks | ~2–3 weeks |
| B | Cross-file impact graph | ~3–4 weeks |
| C | Persistence & robustness | ~2 weeks |
| D | Control plane / SaaS | ~4–6 weeks |
| E | Breadth (languages + agnostic) | ongoing |

These are wider than the 1.0 day-scale estimates because each phase is product work, not prototype work.

---

## Build Order Within Each Phase

Same discipline as 1.0:
1. **Shared types / config first** (`shared/types.ts`, `shared/constants.ts`)
2. **Server-side / parser logic** — core correctness without integration overhead
3. **Unit tests** for that logic
4. **Adapter layer** (hooks CLI, MCP tools, dashboard views) — thin once the core works
5. **End-to-end test script** (`scripts/test-phaseX.sh`) that proves the headline proof point

---

## Dependency Order Between Phases

```
A (enforcement) ──► gives complete edit stream ──► B (impact graph) richer + accurate
                                                  │
                                                  ▼
                              C (persistence) makes A+B durable & ungameable
                                                  │
                                                  ▼
                              D (control plane) sells A+B+C as a product
                                                  │
                                                  ▼
                              E (breadth) widens the moat + TAM
```

Do **not** start D before A+B are proven with a design partner. Do **not** chase E languages before B works in TypeScript.

---

## Mapping to the Strategy Doc

| Phase | enhancement.md section |
|---|---|
| A | §3 "The bold pivot — enforced coordination via hooks" |
| B | §4 "The moat — cross-file/cross-repo semantic impact graph" |
| C | §6 Phase C + §1.2 gaps (persistence, negotiation gaming, diff depth) |
| D | §5 "The business surface — observability & governance" |
| E | §4.3 multi-language + §7 vendor-agnostic defense |

The single demo that justifies the whole pivot is the Phase A proof point: the README collision, prevented with zero agent cooperation. Build and record that first.
