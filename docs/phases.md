# SWAP — Implementation Phases

---

## Overview

SWAP is built in 4 phases. Each phase ships something runnable — no phase ends with half-built infrastructure. The demo for the Conductor team is deliverable after Phase 3.

---

## Phase 1 — Core Server + Agent Registry
**Goal:** Two agents can connect, register, and see each other.
**Outcome:** Runnable server, agents can `list_agents` and know each other exists.

### Tasks

#### 1.1 Project Scaffold
- [ ] Initialize TypeScript project (`package.json`, `tsconfig.json`)
- [ ] Install dependencies: `ws`, `@modelcontextprotocol/sdk`, `uuid`
- [ ] Set up `ts-node` for development, `tsc` for build
- [ ] Directory structure: `server/`, `mcp/`, `shared/`, `parser/`

#### 1.2 Shared Types
- [ ] `shared/types.ts` — `AgentRecord`, `SymbolClaim`, `SemanticDiff`, `SymbolChange`
- [ ] `shared/protocol.ts` — all `MessageType` enums, `Message` envelope, every payload interface
- [ ] `shared/constants.ts` — `HEARTBEAT_INTERVAL`, `REGISTRATION_TIMEOUT`, `CLAIM_TTL`, `SERVER_PORT`

#### 1.3 WebSocket Server
- [ ] `server/index.ts` — bootstrap WebSocket server on port 7700
- [ ] Connection handler: assign temp ID, start registration timeout
- [ ] Message parser: decode raw WebSocket message → typed `Message`
- [ ] Error handling: malformed messages → `ERROR` response, don't crash server

#### 1.4 Agent Registry
- [ ] `server/registry.ts` — in-memory `Map<agentId, AgentRecord>`
- [ ] `add(agent)`, `remove(agentId)`, `get(agentId)`, `getAll()`, `updateStatus()`
- [ ] Handle `REGISTER` message → store agent, reply `REGISTERED`, broadcast `AGENT_JOINED`
- [ ] Handle `PING` → update `lastHeartbeat`, reply `PONG`
- [ ] Heartbeat watchdog: runs every 10s, removes agents that haven't pinged in 30s, broadcasts `AGENT_LEFT`

#### 1.5 Message Router
- [ ] `server/router.ts` — routes incoming messages from registered agents to correct handler
- [ ] `broadcast(message, exceptAgentId?)` — send to all connected agents
- [ ] `send(agentId, message)` — send to specific agent
- [ ] Graceful handling of closed sockets (agent disconnected mid-send)

#### 1.6 MCP Server — Phase 1 Tools Only
- [ ] `mcp/server.ts` — stdio MCP server using `@modelcontextprotocol/sdk`
- [ ] WebSocket client connecting to `ws://localhost:7700`
- [ ] Auto-register with SWAP server on MCP server start (read `SWAP_AGENT_TASK` env var for task description, `SWAP_WORKTREE_PATH` for worktree path)
- [ ] Heartbeat loop: send `PING` every 10 seconds
- [ ] Tool: `list_agents` — sends `LIST_AGENTS` to server, returns roster
- [ ] `mcp/schema.ts` — Zod schemas for all tool inputs

#### 1.7 Phase 1 Smoke Test
- [ ] Script `scripts/test-phase1.sh`: starts server, launches two MCP processes, each calls `list_agents`, verify both see each other
- [ ] Teardown: kill all processes cleanly

**Phase 1 exit criteria:** Two terminals, each running `node mcp/server.js`, both can call `list_agents` and see each other in the result.

---

## Phase 2 — Intent Registry + Conflict Detection
**Goal:** Agents can claim symbols, conflicts are detected and reported.
**Outcome:** If two agents claim the same symbol, both receive structured conflict signals.

### Tasks

#### 2.1 Tree-sitter Integration
- [ ] Install: `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-javascript`
- [ ] `parser/tree-sitter.ts` — initialize parsers for TypeScript and JavaScript
- [ ] `parser/symbol-extractor.ts` — implement `extractSymbols(source, language): Symbol[]`
- [ ] Tree-sitter queries for TypeScript: functions, methods, classes, interfaces, type aliases, exported variables
- [ ] Tree-sitter queries for JavaScript: functions, methods, classes, exported variables
- [ ] `parser/languages/typescript.ts` — query strings + extraction logic
- [ ] `parser/languages/javascript.ts` — query strings + extraction logic
- [ ] Unit tests: extract symbols from 5 fixture files, verify names and line numbers

#### 2.2 File Snapshot Store
- [ ] `parser/diff.ts` — `SnapshotStore`: in-memory map of `(filePath) → FileSnapshot`
- [ ] `takeSnapshot(filePath, source): FileSnapshot`
- [ ] Store snapshot when a symbol is first claimed (baseline)
- [ ] Store snapshot when a symbol is released (current state)

#### 2.3 Intent Registry
- [ ] `server/intent.ts` — `IntentRegistry` class
- [ ] `claim(agentId, filePath, symbolName, intent): ClaimResult`
  - Check compatibility matrix
  - If compatible: store claim, return `GRANTED`
  - If incompatible: return `CONFLICT` with holder info
- [ ] `release(agentId, filePath, symbolName): void`
- [ ] `releaseAll(agentId): void` — for agent disconnect/timeout
- [ ] `getClaims(agentId): SymbolClaim[]`
- [ ] `getClaimsForSymbol(key: SymbolKey): SymbolClaim[]`
- [ ] Claim TTL enforcement: background job checks for claims older than 30 minutes, auto-releases

#### 2.4 Server Handlers for Claim/Release
- [ ] Handle `CLAIM` message → `intentRegistry.claim()` → reply `CLAIM_GRANTED` or `CLAIM_CONFLICT`
- [ ] Handle `RELEASE` message → `intentRegistry.release()` → reply `RELEASE_ACK`
- [ ] On `AGENT_LEFT`: `intentRegistry.releaseAll(agentId)`, broadcast `CLAIMS_RELEASED`

#### 2.5 MCP Tools — Claim and Release
- [ ] Tool: `claim_symbol` — sends `CLAIM` to server, waits for `CLAIM_GRANTED` / `CLAIM_CONFLICT`, returns structured result
- [ ] Tool: `release_symbol` — sends `RELEASE` to server, waits for `RELEASE_ACK`
- [ ] Add `claim_symbol` and `release_symbol` to `mcp/tools.ts`
- [ ] Add input schemas to `mcp/schema.ts`

#### 2.6 Phase 2 Smoke Test
- [ ] Script `scripts/test-phase2.sh`
- [ ] Agent A claims `UserService.authenticate` with intent `write` → GRANTED
- [ ] Agent B claims same symbol → CONFLICT response with Agent A's info
- [ ] Agent A releases → Agent B can now claim successfully
- [ ] Verify claim auto-release on agent disconnect (kill Agent A process, verify Agent B can claim)

**Phase 2 exit criteria:** Conflict detection works reliably. An agent that tries to claim a held symbol gets a structured `CONFLICT` with enough info to make a decision.

---

## Phase 3 — Negotiation + Semantic Diff Streaming
**Goal:** Conflicts resolve automatically. Agents receive semantic summaries of peer changes.
**Outcome:** Full working demo — two agents, same codebase, zero human intervention.

### Tasks

#### 3.1 Dependency Graph
- [ ] `parser/symbol-extractor.ts` — extend to extract call expressions and type references
- [ ] TypeScript query: capture all function calls, `extends`, `implements`, `import` specifiers
- [ ] `server/graph.ts` — `DependencyGraph` class
- [ ] `addEdge(from: SymbolKey, to: SymbolKey, kind)`
- [ ] `countTransitiveDependents(symbolKey, maxDepth): number`
- [ ] `getDependents(symbolKey): SymbolKey[]`
- [ ] `maxDependentCount(): number`
- [ ] Rebuild graph incrementally when a `SemanticDiff` arrives

#### 3.2 Priority Scoring
- [ ] `server/negotiate.ts` — `computePriority(agent, claim, graph): number`
- [ ] Implement all 5 factor functions: `taskCriticalityScore`, `symbolImportanceScore`, `progressInvestedScore`, `claimAgeScore`, `agentLoadScore`
- [ ] Unit tests: verify score ordering for representative scenarios

#### 3.3 Negotiation Protocol
- [ ] Detect negotiation trigger: two agents competing for same symbol, neither explicitly defers
- [ ] `server/negotiate.ts` — `NegotiationSession` class
- [ ] Send `NEGOTIATE_REQUEST` to both agents, start 10s timeout
- [ ] Collect `NEGOTIATE` responses
- [ ] Arbitrate: higher priority wins, reply `CLAIM_GRANTED` to winner, `DEFER` to loser
- [ ] Tie-breaking: earlier claim time wins
- [ ] Timeout handling: non-responding agent loses
- [ ] `DEFER` message includes `suggestion`: unclaimed symbols in the same file agent B could work on instead

#### 3.4 MCP Tool — `negotiate`
- [ ] Tool: `negotiate` — called by agent in response to `NEGOTIATE_REQUEST`, sends priority score + justification
- [ ] MCP client buffers `NEGOTIATE_REQUEST` events, surfaces them via `get_peer_context()`
- [ ] Add to `mcp/tools.ts`

#### 3.5 Semantic Diff Pipeline
- [ ] `server/diff-stream.ts` — on `RELEASE`, compute AST diff
- [ ] `diffSymbols(before: Symbol[], after: Symbol[]): SymbolChange[]`
  - Added: in `after` not in `before`
  - Deleted: in `before` not in `after`
  - Signature changed: same name, different `signature` field
  - Body changed: same name, same signature, different byte range (heuristic for body change)
  - Renamed: if a symbol disappears and a new one appears with similar structure (Levenshtein on name, same kind)
- [ ] Generate human-readable `summary` string for each `SymbolChange`
- [ ] Compute `breakingChange`: true if `DELETED`, `SIGNATURE_CHANGED`, or `RENAMED`
- [ ] Compute `affectedSymbols`: query dependency graph for dependents
- [ ] Broadcast `PEER_DIFF` to all agents except the releasing agent

#### 3.6 MCP Tool — `broadcast_intent` and `get_peer_context`
- [ ] Tool: `broadcast_intent` — sends `BROADCAST_INTENT` to server, server fans out `PEER_INTENT` to all agents
- [ ] Tool: `get_peer_context` — returns buffered `PEER_DIFF` and `PEER_INTENT` events + current agent roster with their claims
- [ ] MCP client: event buffer, max 50 events, oldest dropped when full
- [ ] Add both tools to `mcp/tools.ts`

#### 3.7 Demo Setup
- [ ] `demo/fixture/` — a realistic TypeScript codebase (~200 lines) with:
  - `src/auth/UserService.ts` — class with `authenticate()`, `login()`, `resetPassword()`
  - `src/middleware/rateLimit.ts` — imports from UserService
  - `src/types/auth.ts` — shared types
- [ ] `demo/agent_a.md` — prompt: "Add rate limiting to the auth flow. Use SWAP tools before touching any file."
- [ ] `demo/agent_b.md` — prompt: "Refactor UserService to use dependency injection. Use SWAP tools before touching any file."
- [ ] `demo/run.sh`:
  ```bash
  node server/index.js &
  sleep 0.5
  SWAP_AGENT_TASK="Add rate limiting" SWAP_WORKTREE_PATH="./demo/worktree-a" \
    claude --model claude-sonnet-4-6 --dangerously-skip-permissions \
           -p "$(cat demo/agent_a.md)" 2>&1 | sed 's/^/[A] /' &
  SWAP_AGENT_TASK="Refactor DI" SWAP_WORKTREE_PATH="./demo/worktree-b" \
    claude --model claude-sonnet-4-6 --dangerously-skip-permissions \
           -p "$(cat demo/agent_b.md)" 2>&1 | sed 's/^/[B] /' &
  wait
  ```

#### 3.8 Phase 3 Integration Test
- [ ] Run demo end to end
- [ ] Verify: agents claim symbols before editing
- [ ] Verify: conflict on `authenticate()` triggers negotiation
- [ ] Verify: loser receives `DEFER` with a suggestion
- [ ] Verify: winner's changes emit `PEER_DIFF` to loser
- [ ] Verify: both agents finish without merge conflict on the fixture codebase
- [ ] Record terminal output as demo artifact

**Phase 3 exit criteria:** The demo runs end-to-end. Two agents coordinate on a shared codebase, conflicts are resolved automatically, and both agents incorporate each other's changes. This is the Conductor demo.

---

## Phase 4 — Hardening + Additional Languages
**Goal:** Production-grade reliability. Python and Go support. README ready for public.
**Outcome:** Publishable open-source repository.

### Tasks

#### 4.1 Server Crash Recovery
- [ ] Persist claim state to `swap-state.json` every 30 seconds (atomic write)
- [ ] On server restart: load state, mark agents `disconnected`, wait for reconnections
- [ ] Claims from disconnected agents expire after 60s post-restart
- [ ] Log all claim/release/conflict events to append-only `swap.log`

#### 4.2 WebSocket Reconnection (MCP Client)
- [ ] Detect WebSocket close in MCP client
- [ ] Exponential backoff retry: 1s, 2s, 4s, 8s, 16s, max 30s
- [ ] On reconnect: re-register with same agent ID + task description
- [ ] Server restores claims for reconnecting agent from persisted state

#### 4.3 Python Language Support
- [ ] Install `tree-sitter-python`
- [ ] `parser/languages/python.ts` — queries for functions (`def`), classes, methods, module-level variables
- [ ] Signature extraction: parse type annotations from Python AST nodes
- [ ] Dependency extraction: function calls, `import` statements, `from X import Y`
- [ ] Unit tests: 3 Python fixture files

#### 4.4 Go Language Support
- [ ] Install `tree-sitter-go`
- [ ] `parser/languages/go.ts` — queries for functions, methods, structs, interfaces
- [ ] Signature extraction: Go function signatures
- [ ] Partial dependency extraction: function calls (type references harder in Go, defer to Phase 4 stretch)

#### 4.5 README and Documentation
- [ ] `README.md`: what SWAP is, why it exists, 5-minute quickstart
- [ ] Architecture diagram (ASCII, matches design.md)
- [ ] Tool API reference (pulled from `mcp/schema.ts`)
- [ ] Integration guide: how to add SWAP to a Conductor workflow
- [ ] Demo GIF or terminal recording

#### 4.6 npm Package
- [ ] `package.json` — `"bin"` field pointing to compiled server and MCP entrypoints
- [ ] `npm run build` → `dist/` with compiled JS
- [ ] `npx swap-server` — starts the SWAP server
- [ ] `npx swap-mcp` — starts the MCP adapter (for use in MCP config)
- [ ] Verify: `npx` install from local tarball works end to end

**Phase 4 exit criteria:** Public GitHub repo, clean README, `npx swap-server` works, Python and Go fixtures pass symbol extraction tests.

---

## Timeline Estimate

| Phase | Scope | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Server + Registry + list_agents | 1 day |
| Phase 2 | Tree-sitter + Intent Registry + claim/release | 2 days |
| Phase 3 | Negotiation + Diff Streaming + Demo | 2 days |
| Phase 4 | Hardening + Python/Go + npm package | 2 days |
| **Total** | | **~7 days** |

---

## Build Order Within Each Phase

For each phase, build in this order:
1. **Shared types first** — everything else depends on them
2. **Server-side logic** — core correctness without MCP overhead
3. **Unit tests for server logic** — catch bugs before integration
4. **MCP adapter** — thin wrapper, should be straightforward once server works
5. **End-to-end smoke test** — one script that proves the phase works

---

## What to Ship to Conductor After Phase 3

A single GitHub repository with:
- Working code (TypeScript, fully compilable)
- The demo script that shows two agents coordinating
- `docs/design.md` (this document)
- A short cover note explaining: "I found the gap in your agent isolation model, here's the fix, here's a working demo"

That is the artifact that gets you a conversation with their team.
