# SWAP — Semantic Workspace Awareness Protocol
## Complete Technical Design Document

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Why Existing Solutions Fall Short](#2-why-existing-solutions-fall-short)
3. [SWAP Overview](#3-swap-overview)
4. [System Architecture](#4-system-architecture)
5. [Core Subsystems](#5-core-subsystems)
   - 5.1 [WebSocket Server & Agent Registry](#51-websocket-server--agent-registry)
   - 5.2 [Symbol-Level Intent Registry](#52-symbol-level-intent-registry)
   - 5.3 [AST Parser (Tree-sitter)](#53-ast-parser-tree-sitter)
   - 5.4 [Conflict Detection Engine](#54-conflict-detection-engine)
   - 5.5 [Priority-Based Negotiation Protocol](#55-priority-based-negotiation-protocol)
   - 5.6 [Live Semantic Diff Streaming](#56-live-semantic-diff-streaming)
   - 5.7 [MCP Server Layer](#57-mcp-server-layer)
6. [Wire Protocol](#6-wire-protocol)
7. [MCP Tool API](#7-mcp-tool-api)
8. [Data Schemas](#8-data-schemas)
9. [Conflict Scoring Algorithm](#9-conflict-scoring-algorithm)
10. [Security & Fault Tolerance](#10-security--fault-tolerance)
11. [Language Support Matrix](#11-language-support-matrix)
12. [Integration with Conductor](#12-integration-with-conductor)
13. [Repository Structure](#13-repository-structure)

---

## 1. Problem Statement

Conductor's core value proposition is running multiple Claude Code agents in parallel, each in an isolated git worktree. This solves the **physical isolation** problem — agents don't write to the same files at the same time.

However, physical isolation does not solve **semantic isolation**. Consider this scenario:

```
Codebase: e-commerce platform, TypeScript

Agent A task: "Add rate limiting to the authentication flow"
Agent B task: "Refactor UserService to use dependency injection"

Agent A starts modifying:
  - src/auth/UserService.ts → method authenticate()
  - src/middleware/rateLimit.ts → new file

Agent B starts modifying:
  - src/auth/UserService.ts → entire class structure
  - src/auth/UserService.ts → method authenticate() (renaming + restructuring)
```

Both agents work in separate worktrees. Git will detect a line-level conflict when Conductor tries to merge. But the real damage happens earlier:

- Agent A writes `authenticate()` assuming the current interface signature
- Agent B rewrites `authenticate()` with a completely different signature
- Agent A's rate limiting logic wraps a function that no longer exists in the form it expected
- Neither agent knows this is happening
- The merge produces code that compiles but is semantically broken

**This is the unsolved problem.** Worktree isolation prevents git conflicts from being catastrophic, but it does not give agents the shared context they need to make coherent decisions about a shared codebase.

### The Specific Gaps

1. **No agent registry** — agents don't know who else is running, what they're doing, or what they've already changed
2. **No intent declaration** — agents can't announce "I am about to touch X" before they touch it
3. **No conflict detection** — no system checks whether two agents' intended changes will semantically collide
4. **No negotiation** — when two agents want the same symbol, there is no protocol to resolve this without human intervention
5. **No live context sharing** — when Agent A changes a function signature, Agent B doesn't know until the merge fails

---

## 2. Why Existing Solutions Fall Short

### File-Level Locking
Tools that lock at the file level (e.g., "Agent A owns `auth.ts`") are too coarse-grained. A 500-line file may contain 30 functions. Two agents can safely modify 29 of those functions in parallel. Locking the entire file serializes work unnecessarily.

### Git Branch Protection
Git worktrees prevent conflict at the storage level, not the semantic level. Two agents can each commit valid, compiling code to their respective branches, with both branches diverging from the same base — and only discover the semantic incompatibility at merge time, after hours of agent work.

### Text-Level Diff Comparison
Comparing raw diffs between agents is brittle. A rename refactor produces a large textual diff but may have zero semantic impact on callers. An interface change might produce a tiny textual diff but breaks every caller. Semantic understanding requires AST-level analysis.

### Manual Task Decomposition
Current best practice is to manually decompose tasks before running agents so they don't overlap. This is:
- Time-consuming (negates the speed benefit of parallel agents)
- Error-prone (humans miss dependencies)
- Not adaptive (tasks evolve during execution and the original decomposition may no longer be valid)

### Message Passing (e.g., Conductor Bus)
Existing message bus solutions are unstructured — agents send free-text messages. There is no protocol for claiming ownership, no schema for conflict signals, no mechanism for negotiation. An agent that receives "I'm working on auth" has no machine-readable information about what specifically is being touched or what to avoid.

---

## 3. SWAP Overview

SWAP is a real-time coordination layer that operates between Conductor and its agents. It is exposed to agents as a set of MCP tools, meaning agents use SWAP through the same protocol they use for all other capabilities — no changes to agent prompts or Conductor's core infrastructure.

### Core Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                        SWAP System                              │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │  Agent       │    │          SWAP Server                  │  │
│  │  Registry    │◄──►│                                      │  │
│  └──────────────┘    │  ┌────────────────────────────────┐  │  │
│                       │  │     Intent Registry            │  │  │
│  ┌──────────────┐    │  │  (symbol → agent ownership)    │  │  │
│  │  Conflict    │◄──►│  └────────────────────────────────┘  │  │
│  │  Engine      │    │                                      │  │
│  └──────────────┘    │  ┌────────────────────────────────┐  │  │
│                       │  │     Diff Stream Pipeline       │  │  │
│  ┌──────────────┐    │  │  (AST snapshots → summaries)   │  │  │
│  │  Negotiation │◄──►│  └────────────────────────────────┘  │  │
│  │  Protocol    │    │                                      │  │
│  └──────────────┘    │  ┌────────────────────────────────┐  │  │
│                       │  │     Negotiation Arbiter        │  │  │
│  ┌──────────────┐    │  │  (priority scoring + resolve)  │  │  │
│  │  Semantic    │◄──►│  └────────────────────────────────┘  │  │
│  │  Diff Engine │    │                                      │  │
│  └──────────────┘    └──────────────────────────────────────┘  │
│                                           ▲                     │
│  ┌────────────────────────────────────────┼──────────────────┐  │
│  │              MCP Layer                 │                  │  │
│  │                                        │                  │  │
│  │   claim_symbol()  release_symbol()     │                  │  │
│  │   broadcast_intent()  get_peer_context()                  │  │
│  │   list_agents()   negotiate()                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲                                            ▲
         │                                            │
    [Agent A]                                    [Agent B]
  (Claude Code)                                (Claude Code)
  worktree-alpha                               worktree-beta
```

### What Agents Experience

From an agent's perspective, SWAP adds five new tools to its MCP toolkit:

1. **`claim_symbol`** — "I am about to modify this function. Grant me exclusive write access."
2. **`release_symbol`** — "I am done with this function. Others may claim it."
3. **`broadcast_intent`** — "Here is a high-level description of what I'm about to do and which areas I'll touch."
4. **`get_peer_context`** — "What are all other agents currently doing? What have they recently changed?"
5. **`list_agents`** — "Who is currently online and what is their status?"

These tools slot naturally into an agent's reasoning loop. Before editing a file, it claims the symbols it needs. After finishing, it releases them. It periodically polls peer context to update its understanding of the shared codebase state.

---

## 4. System Architecture

### Component Overview

```
swap/
├── server/                    # SWAP coordination server
│   ├── index.ts               # Entry point, WebSocket server bootstrap
│   ├── registry.ts            # Agent registration and lifecycle
│   ├── intent.ts              # Symbol claim/release/conflict detection
│   ├── negotiate.ts           # Priority arbitration
│   ├── diff-stream.ts         # AST diff pipeline and semantic summarization
│   └── router.ts              # Message routing between agents
│
├── parser/                    # AST parsing layer
│   ├── index.ts               # Parser factory, language detection
│   ├── tree-sitter.ts         # Tree-sitter wrapper
│   ├── symbol-extractor.ts    # Extract symbols from AST
│   ├── diff.ts                # AST snapshot diffing
│   └── languages/             # Per-language Tree-sitter grammars + queries
│       ├── typescript.ts
│       ├── python.ts
│       ├── go.ts
│       └── rust.ts
│
├── mcp/                       # MCP server exposing SWAP as tools
│   ├── server.ts              # MCP server bootstrap
│   ├── tools.ts               # Tool definitions and handlers
│   └── schema.ts              # Input/output schemas for each tool
│
├── shared/                    # Shared types used across all layers
│   ├── types.ts               # Core domain types
│   ├── protocol.ts            # Wire protocol message schemas
│   └── constants.ts           # Timeouts, limits, defaults
│
├── demo/                      # Working demo for Conductor team
│   ├── run.sh                 # Orchestrates demo run
│   ├── agent_a.md             # Agent A prompt
│   ├── agent_b.md             # Agent B prompt
│   └── fixture/               # Sample codebase agents work on
│
└── docs/
    ├── design.md              # This document
    └── phases.md              # Implementation plan
```

### Runtime Topology

```
[Conductor Desktop App]
        │
        ├── spawns worktree-alpha  ── [Claude Code Agent A]
        │                                      │
        │                                      │ MCP (stdio)
        │                                      ▼
        │                             [swap-mcp process #1]
        │                                      │
        │                                      │ WebSocket ws://localhost:7700
        │                                      ▼
        │                             ┌─────────────────┐
        │                             │   SWAP Server   │
        │                             │  (port 7700)    │
        │                             └─────────────────┘
        │                                      ▲
        │                                      │ WebSocket ws://localhost:7700
        │                             [swap-mcp process #2]
        │                                      ▲
        │                                      │ MCP (stdio)
        └── spawns worktree-beta  ── [Claude Code Agent B]
```

### Key Architectural Decisions

**Decision 1: WebSocket over HTTP polling**
WebSocket provides full-duplex communication — the server can push conflict signals to agents in real time without agents needing to poll. When Agent A claims a symbol and Agent B has already claimed it, Agent A receives an immediate `CONFLICT` response, not a delayed 500ms poll response. For negotiation to feel responsive, push is essential.

**Decision 2: MCP as the agent interface**
Agents interact with SWAP exclusively through MCP tools. This means:
- Zero changes to Claude Code itself
- Works with any MCP-compatible agent, not just Claude
- SWAP is composable with other MCP servers
- The Conductor team can integrate SWAP by adding one MCP server to their agent launch config

**Decision 3: Tree-sitter for AST parsing**
Tree-sitter is a production-grade incremental parser used in Neovim, Zed, GitHub, and others. It supports 40+ languages with a unified query API. Crucially, it produces concrete syntax trees even for files with syntax errors — important because agents frequently edit files into intermediate broken states.

**Decision 4: Symbol granularity, not file granularity**
Claims are made at the symbol level (functions, classes, interfaces, exported constants) rather than file level. This maximizes parallel throughput — two agents can work on different functions in the same file simultaneously, which is extremely common for large files.

---

## 5. Core Subsystems

### 5.1 WebSocket Server & Agent Registry

The SWAP server is a Node.js WebSocket server. It is the single source of truth for all coordination state.

#### Bootstrap Sequence

```typescript
// server/index.ts

const wss = new WebSocketServer({ port: 7700 });

wss.on('connection', (ws) => {
  const agentId = generateId();
  
  // Agent must REGISTER within 5 seconds or connection is dropped
  const registrationTimeout = setTimeout(() => ws.close(4001, 'Registration timeout'), 5000);
  
  ws.on('message', (raw) => {
    const msg = parseMessage(raw);
    
    if (msg.type === 'REGISTER') {
      clearTimeout(registrationTimeout);
      registry.add({ id: agentId, ws, ...msg.payload });
      ws.send(encode({ type: 'REGISTERED', agentId }));
      broadcast({ type: 'AGENT_JOINED', agentId }, except: agentId);
    } else {
      router.handle(agentId, msg);
    }
  });
  
  ws.on('close', () => {
    registry.remove(agentId);
    intentRegistry.releaseAll(agentId);  // release all claims on disconnect
    broadcast({ type: 'AGENT_LEFT', agentId });
  });
});
```

#### Agent Registry Data Model

```typescript
interface AgentRecord {
  id: string;                   // uuid-v4
  worktreePath: string;         // absolute path to agent's worktree
  taskDescription: string;      // human-readable task summary
  status: 'idle' | 'active' | 'waiting' | 'done';
  connectedAt: number;          // epoch ms
  lastHeartbeat: number;        // epoch ms — stale after 30s
  claims: SymbolClaim[];        // currently held symbol claims
  recentDiffs: SemanticDiff[];  // last 10 semantic diffs this agent produced
}
```

#### Heartbeat Protocol

Agents send a `PING` every 10 seconds. If the server receives no `PING` for 30 seconds, the agent is marked `stale` and all its claims are released. This handles agent crashes gracefully — claimed symbols don't stay locked forever.

---

### 5.2 Symbol-Level Intent Registry

The intent registry is an in-memory map from `(filePath, symbolName)` pairs to the agent that currently holds a write claim.

#### Data Model

```typescript
type SymbolKey = string;  // `${filePath}::${symbolName}`

interface SymbolClaim {
  key: SymbolKey;
  filePath: string;
  symbolName: string;
  symbolKind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  intent: 'read' | 'write' | 'refactor' | 'delete';
  agentId: string;
  claimedAt: number;         // epoch ms
  estimatedRelease: number;  // epoch ms — agent's self-reported estimate
  priority: number;          // 0.0 – 1.0, computed at claim time
}

// Read claims: many agents can hold simultaneously
// Write/refactor/delete claims: exclusive — only one agent at a time
```

#### Claim Request Flow

```
Agent A sends:
  CLAIM { filePath: "src/auth/UserService.ts", symbolName: "authenticate", intent: "write" }

Server:
  1. Parse filePath + symbolName → SymbolKey
  2. Check if write claim exists for this key
     → No existing claim: grant immediately, store claim, reply CLAIM_GRANTED
     → Existing read claims only: check if requesting write is compatible
       → If requesting write: reply CLAIM_CONFLICT with holders list
     → Existing write claim by different agent: enter negotiation
       → Compute priority scores for both agents
       → Notify both agents of CONFLICT
       → Wait for NEGOTIATE messages (timeout: 10s)
       → Arbitrate: grant to higher priority agent, send DEFER to loser
```

#### Claim Compatibility Matrix

| Existing \ Requested | read | write | refactor | delete |
|----------------------|------|-------|----------|--------|
| **read**             | ✓    | ✗     | ✗        | ✗      |
| **write**            | ✗    | ✗     | ✗        | ✗      |
| **refactor**         | ✗    | ✗     | ✗        | ✗      |
| **delete**           | ✗    | ✗     | ✗        | ✗      |
| *none*               | ✓    | ✓     | ✓        | ✓      |

Multiple simultaneous reads are safe. Any write-type claim is exclusive.

---

### 5.3 AST Parser (Tree-sitter)

The parser layer converts source files into structured symbol maps that the intent registry and diff engine consume.

#### Symbol Extraction

For each language, we define a Tree-sitter query that extracts named symbols:

```typescript
// parser/languages/typescript.ts

const SYMBOL_QUERY = `
  (function_declaration name: (identifier) @name) @function
  (method_definition name: (property_identifier) @name) @method
  (class_declaration name: (type_identifier) @name) @class
  (interface_declaration name: (type_identifier) @name) @interface
  (type_alias_declaration name: (type_identifier) @name) @type
  (export_statement declaration: (_) @decl) @export
  (lexical_declaration (variable_declarator name: (identifier) @name)) @variable
`;

export function extractSymbols(source: string): Symbol[] {
  const tree = parser.parse(source);
  const matches = query.matches(tree.rootNode);
  return matches.map(match => ({
    name: match.captures.find(c => c.name === 'name')?.node.text,
    kind: inferKind(match),
    startLine: match.node.startPosition.row,
    endLine: match.node.endPosition.row,
    startByte: match.node.startIndex,
    endByte: match.node.endIndex,
  }));
}
```

#### Snapshot Store

Every time an agent releases a claim on a symbol, the parser takes a new snapshot of the file and stores it. This snapshot is the baseline for the diff engine.

```typescript
interface FileSnapshot {
  filePath: string;
  takenAt: number;
  commitHash: string;       // git commit at time of snapshot
  symbols: Symbol[];
  fullSource: string;
}

// Stored per (filePath, agentId) pair
// On release: diff currentSnapshot vs previousSnapshot → emit SemanticDiff
```

---

### 5.4 Conflict Detection Engine

Beyond direct claim conflicts (two agents explicitly claiming the same symbol), there is a subtler class of conflicts: **dependency conflicts**.

Agent A modifies `authenticate()`. Agent B modifies `login()` which calls `authenticate()`. Even if B never touches `authenticate()` directly, B's work depends on A's version of `authenticate()`. If A changes the signature, B's changes become invalid.

#### Dependency Graph

The conflict engine maintains a symbol dependency graph, constructed from Tree-sitter's call expression and type reference queries:

```typescript
interface DependencyEdge {
  from: SymbolKey;    // caller / type consumer
  to: SymbolKey;      // callee / type definition
  kind: 'call' | 'extend' | 'implement' | 'import' | 'type-use';
}
```

When Agent A claims symbol X with intent `write` or `refactor`, the engine:
1. Finds all symbols that depend on X (direct and transitive, up to depth 3)
2. Checks if any of those dependent symbols are claimed by other agents
3. If yes, emits a `DEPENDENCY_CONFLICT` warning (not a hard block — agents may still proceed but are informed)

```
Agent A claims: UserService.authenticate (write)
Engine finds dependents: login(), resetPassword(), oauthCallback()
Agent B currently claims: login() (write)

→ DEPENDENCY_CONFLICT {
    owner: "agent_a",
    symbol: "UserService.authenticate",
    affectedAgent: "agent_b",
    affectedSymbol: "login",
    reason: "login() calls authenticate() — interface changes will affect agent_b's work"
  }
```

This is a warning, not a block. The agents can decide independently how to handle it (coordinate, defer, or proceed with awareness).

---

### 5.5 Priority-Based Negotiation Protocol

When two agents conflict on a symbol, the negotiation protocol resolves it without human intervention.

#### Priority Score Components

```typescript
interface PriorityFactors {
  taskCriticality: number;    // 0–1: derived from task description keywords (auth, payment, core vs. cleanup, style, docs)
  symbolImportance: number;   // 0–1: how many other symbols depend on this one (normalized by max deps in graph)
  progressInvested: number;   // 0–1: how many symbols has this agent already released (sunk cost proxy)
  claimAge: number;           // 0–1: how long ago did this agent claim adjacent symbols (established territory)
  agentLoad: number;          // 0–1: inverse of number of current claims (less loaded agent may be more flexible)
}

function computePriority(agent: AgentRecord, claim: SymbolClaim, graph: DependencyGraph): number {
  const factors = computeFactors(agent, claim, graph);
  
  // Weighted sum — weights tunable
  return (
    factors.taskCriticality   * 0.35 +
    factors.symbolImportance  * 0.25 +
    factors.progressInvested  * 0.20 +
    factors.claimAge          * 0.15 +
    factors.agentLoad         * 0.05
  );
}
```

#### Negotiation Round-Trip

```
Server detects conflict: agent_a vs agent_b on symbol X

Server → agent_a: NEGOTIATE_REQUEST { symbol: X, competitorId: "agent_b", timeoutMs: 10000 }
Server → agent_b: NEGOTIATE_REQUEST { symbol: X, competitorId: "agent_a", timeoutMs: 10000 }

agent_a → Server: NEGOTIATE { priority: 0.87, justification: "This is the core auth path, 12 callers depend on it" }
agent_b → Server: NEGOTIATE { priority: 0.61, justification: "Minor cleanup, can defer to after agent_a" }

Server computes: agent_a wins (0.87 > 0.61)

Server → agent_a: CLAIM_GRANTED { symbol: X }
Server → agent_b: DEFER { 
  symbol: X, 
  deferTo: "agent_a",
  suggestion: "Consider working on login() or resetPassword() in the meantime — they are unclaimed"
}
```

#### Tie-breaking

If priority scores are within 0.05 of each other, the server uses deterministic tie-breaking: earlier claim time wins. This prevents infinite re-negotiation loops.

#### Timeout Handling

If an agent does not respond to `NEGOTIATE_REQUEST` within 10 seconds, the responding agent wins by default. Silent agents (crashed or stuck) do not block the system.

---

### 5.6 Live Semantic Diff Streaming

When an agent releases a claim, it triggers the diff pipeline. The goal is not to send raw diffs to peer agents — raw diffs are noisy and take up context window. Instead, SWAP sends **semantic summaries**: machine-parseable descriptions of what changed at the symbol level.

#### Diff Pipeline

```
Agent A releases claim on UserService.authenticate

Step 1: Take new AST snapshot of src/auth/UserService.ts
Step 2: Diff against previous snapshot
Step 3: Classify changes per symbol:
  - authenticate(): SIGNATURE_CHANGED (params: added `options?: RateLimitOptions`)
                    BODY_CHANGED (added rate limit check)
  - No other symbols changed in this release

Step 4: Build SemanticDiff
Step 5: Broadcast to all agents except agent_a
```

#### SemanticDiff Schema

```typescript
interface SemanticDiff {
  id: string;
  fromAgentId: string;
  filePath: string;
  releasedAt: number;
  changes: SymbolChange[];
}

interface SymbolChange {
  symbolName: string;
  symbolKind: string;
  changeType: 
    | 'ADDED'              // new symbol
    | 'DELETED'            // symbol removed
    | 'SIGNATURE_CHANGED'  // params or return type changed
    | 'BODY_CHANGED'       // implementation changed, interface same
    | 'RENAMED'            // symbol renamed
    | 'MOVED';             // symbol moved to different file
  
  before?: SymbolSignature;
  after?: SymbolSignature;
  
  // Human-readable summary for agent context window
  summary: string;
  // e.g. "authenticate() signature changed: added optional 'options' parameter of type RateLimitOptions"
  
  // Impact assessment
  breakingChange: boolean;  // true if callers must be updated
  affectedSymbols: string[]; // symbols in the graph that depend on this
}
```

#### What Agents Do With SemanticDiffs

Agents receive `PEER_DIFF` events passively via WebSocket. Their MCP client buffers these and makes them available via `get_peer_context()`. Agents are expected to call `get_peer_context()` periodically (every few actions) and incorporate the changes into their understanding of the codebase.

A well-prompted agent, upon receiving a `SIGNATURE_CHANGED` for a function it calls, will re-read the changed file before proceeding. This is the mechanism through which SWAP prevents agents from working on stale assumptions.

---

### 5.7 MCP Server Layer

The MCP server is a thin adapter between the SWAP WebSocket client and Claude Code's tool use protocol. It runs as a stdio MCP server — one process per agent — and maintains a persistent WebSocket connection to the SWAP server.

```typescript
// mcp/server.ts

const swapClient = new WebSocketClient('ws://localhost:7700');
const mcpServer = new Server({ name: 'swap', version: '1.0.0' });

// Buffer for incoming peer events
const eventBuffer: SWAPEvent[] = [];
swapClient.on('message', (event) => eventBuffer.push(event));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'claim_symbol':     return handleClaim(request.params.arguments);
    case 'release_symbol':   return handleRelease(request.params.arguments);
    case 'broadcast_intent': return handleBroadcast(request.params.arguments);
    case 'get_peer_context': return handleGetContext();
    case 'list_agents':      return handleListAgents();
  }
});
```

The MCP server communicates with the SWAP server via WebSocket, serializing/deserializing the SWAP wire protocol on one side and MCP JSON-RPC on the other.

---

## 6. Wire Protocol

All messages between agents and the SWAP server are JSON, framed over WebSocket (no length-prefix needed — WebSocket handles framing natively).

### Message Envelope

```typescript
interface Message {
  id: string;           // uuid-v4, for request-response correlation
  type: MessageType;
  timestamp: number;    // epoch ms
  payload: unknown;     // type-specific, see below
}
```

### Message Types (Client → Server)

| Type | Payload | Description |
|------|---------|-------------|
| `REGISTER` | `{ worktreePath, taskDescription }` | Agent announces itself |
| `PING` | `{}` | Heartbeat, must be sent every 10s |
| `CLAIM` | `{ filePath, symbolName, intent, estimatedRelease }` | Request symbol ownership |
| `RELEASE` | `{ filePath, symbolName, newSource }` | Release symbol, trigger diff |
| `NEGOTIATE` | `{ priority, justification }` | Respond to negotiation request |
| `BROADCAST_INTENT` | `{ description, filePaths }` | Announce high-level plan |
| `STATUS_UPDATE` | `{ status }` | Update agent status |

### Message Types (Server → Client)

| Type | Payload | Description |
|------|---------|-------------|
| `REGISTERED` | `{ agentId }` | Confirm registration |
| `AGENT_JOINED` | `{ agentId, taskDescription }` | Peer connected |
| `AGENT_LEFT` | `{ agentId }` | Peer disconnected |
| `CLAIM_GRANTED` | `{ filePath, symbolName }` | Claim approved |
| `CLAIM_CONFLICT` | `{ filePath, symbolName, heldBy, intent }` | Hard conflict |
| `DEPENDENCY_CONFLICT` | `{ ... }` | Soft conflict (advisory) |
| `NEGOTIATE_REQUEST` | `{ symbol, competitorId, timeoutMs }` | Enter negotiation |
| `DEFER` | `{ symbol, deferTo, suggestion }` | You lost negotiation |
| `PEER_DIFF` | `SemanticDiff` | Peer released a claim with changes |
| `PEER_INTENT` | `{ agentId, description, filePaths }` | Peer broadcast intent |
| `AGENT_LIST` | `AgentRecord[]` | Current agent roster |
| `PONG` | `{}` | Heartbeat response |

---

## 7. MCP Tool API

These are the five tools agents see in their MCP toolkit.

### `claim_symbol`

Request exclusive or shared access to a named symbol before modifying it.

```typescript
// Input
{
  filePath: string;                              // relative to worktree root
  symbolName: string;                            // exact symbol name as it appears in code
  intent: 'read' | 'write' | 'refactor' | 'delete';
  estimatedMinutes?: number;                     // optional: helps peers plan
}

// Output (success)
{
  granted: true;
  claimId: string;
}

// Output (conflict)
{
  granted: false;
  heldBy: string;                                // agent id
  heldByTask: string;                            // peer's task description
  intent: string;                                // what they're doing with it
  suggestion?: string;                           // other symbols to work on instead
}
```

### `release_symbol`

Release a claimed symbol. Triggers diff computation and peer notification.

```typescript
// Input
{
  filePath: string;
  symbolName: string;
  newSource?: string;  // optionally provide current file source to snapshot
}

// Output
{
  released: true;
  diffEmitted: boolean;  // true if changes were detected vs. last snapshot
}
```

### `broadcast_intent`

Announce to all peers what you're about to work on at a high level.

```typescript
// Input
{
  description: string;    // human-readable: "I'm adding rate limiting to the auth flow"
  filePaths: string[];    // files you expect to touch
  estimatedMinutes?: number;
}

// Output
{
  delivered: number;  // number of peers that received the broadcast
}
```

### `get_peer_context`

Get a snapshot of everything peers are doing and everything they've recently changed.

```typescript
// Input
{} // no arguments

// Output
{
  agents: {
    id: string;
    taskDescription: string;
    status: string;
    currentClaims: { filePath: string; symbolName: string; intent: string; }[];
    recentDiffs: {
      filePath: string;
      changes: { symbolName: string; changeType: string; summary: string; breakingChange: boolean; }[];
      releasedAt: number;
    }[];
  }[];
  pendingEvents: SWAPEvent[];  // events buffered since last call
}
```

### `list_agents`

Lightweight agent roster. Useful at task start to understand who is running.

```typescript
// Input
{} // no arguments

// Output
{
  agents: { id: string; taskDescription: string; status: string; claimCount: number; }[];
  totalActive: number;
}
```

---

## 8. Data Schemas

### Symbol

```typescript
interface Symbol {
  name: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant';
  exported: boolean;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  signature?: string;    // for functions/methods: param types + return type
  dependencies: string[]; // symbols this one references
}
```

### SymbolSignature

```typescript
interface SymbolSignature {
  params: { name: string; type: string; optional: boolean; }[];
  returnType: string;
  typeParams?: string[];  // generics
  async: boolean;
}
```

### SemanticDiff (full)

```typescript
interface SemanticDiff {
  id: string;
  fromAgentId: string;
  filePath: string;
  releasedAt: number;
  changes: SymbolChange[];
  stats: {
    added: number;
    deleted: number;
    modified: number;
    breaking: number;
  };
}
```

---

## 9. Conflict Scoring Algorithm

Priority score computation in full detail.

### Task Criticality Score

Derived from the agent's task description using keyword heuristics:

```typescript
const HIGH_CRITICALITY_TERMS = [
  'auth', 'authentication', 'payment', 'billing', 'security',
  'core', 'critical', 'production', 'migration', 'schema'
];

const LOW_CRITICALITY_TERMS = [
  'cleanup', 'style', 'lint', 'rename', 'comment', 'docs',
  'typo', 'format', 'minor', 'cosmetic'
];

function taskCriticalityScore(taskDescription: string): number {
  const lower = taskDescription.toLowerCase();
  const highMatches = HIGH_CRITICALITY_TERMS.filter(t => lower.includes(t)).length;
  const lowMatches = LOW_CRITICALITY_TERMS.filter(t => lower.includes(t)).length;
  return clamp(0.5 + (highMatches * 0.15) - (lowMatches * 0.15), 0, 1);
}
```

### Symbol Importance Score

```typescript
function symbolImportanceScore(symbolKey: SymbolKey, graph: DependencyGraph): number {
  const dependentCount = graph.countTransitiveDependents(symbolKey, maxDepth: 4);
  const maxDependents = graph.maxDependentCount();
  return maxDependents === 0 ? 0.5 : dependentCount / maxDependents;
}
```

### Progress Invested Score

```typescript
function progressInvestedScore(agent: AgentRecord): number {
  const releasedCount = agent.recentDiffs.length;
  // Saturates at 10 released symbols = full score
  return Math.min(releasedCount / 10, 1.0);
}
```

### Final Score

```typescript
function computePriority(agent: AgentRecord, claim: SymbolClaim, graph: DependencyGraph): number {
  const tc = taskCriticalityScore(agent.taskDescription);
  const si = symbolImportanceScore(claim.key, graph);
  const pi = progressInvestedScore(agent);
  const ca = claimAgeScore(agent, claim);        // how long ago agent established adjacent claims
  const al = agentLoadScore(agent);              // inverse of current claim count

  return tc * 0.35 + si * 0.25 + pi * 0.20 + ca * 0.15 + al * 0.05;
}
```

---

## 10. Security & Fault Tolerance

### Stale Agent Cleanup
- Agents that miss 3 consecutive heartbeats (30s) are removed from the registry
- All their claims are released atomically
- Peers receive `AGENT_LEFT` + claim release diffs

### Claim Expiry
- Claims have a maximum TTL of 30 minutes regardless of heartbeat
- This prevents runaway agents from permanently locking critical symbols
- Agents that need longer can re-claim after release

### Duplicate Claim IDs
- All claim IDs are uuid-v4 generated server-side
- Clients that replay a `CLAIM` message receive `ALREADY_CLAIMED_BY_YOU` (idempotent)

### WebSocket Reconnection
- MCP client holds a WebSocket connection to SWAP server
- On disconnect: exponential backoff retry (1s, 2s, 4s, 8s, max 30s)
- On reconnect: agent re-registers with same agent ID, server restores claim state from checkpoint
- Peers receive `AGENT_RECONNECTED` instead of `AGENT_JOINED`

### Server Crash Recovery
- SWAP server persists snapshot of all claims to disk (JSON file) every 30 seconds
- On restart: loads snapshot, marks all agents `disconnected`, waits for reconnections
- Claims from disconnected agents expire after 60 seconds post-restart

---

## 11. Language Support Matrix

| Language | Symbol Extraction | Signature Parsing | Dependency Graph | Status |
|----------|-------------------|-------------------|------------------|--------|
| TypeScript | ✓ | ✓ | ✓ | Phase 1 |
| JavaScript | ✓ | ✓ | ✓ | Phase 1 |
| Python | ✓ | ✓ | ✓ | Phase 2 |
| Go | ✓ | ✓ | partial | Phase 2 |
| Rust | ✓ | ✓ | partial | Phase 3 |
| Java | ✓ | ✓ | partial | Phase 3 |
| Ruby | ✓ | partial | partial | Phase 3 |
| C/C++ | ✓ | partial | — | Phase 4 |

Phase 1 targets TypeScript/JavaScript because that matches Conductor's own stack and the majority of real-world Conductor usage.

---

## 12. Integration with Conductor

SWAP is designed to slot into Conductor with no changes to Conductor's core:

### For Conductor Users

Add SWAP to the MCP server list in their Claude Code config:

```json
{
  "mcpServers": {
    "swap": {
      "command": "node",
      "args": ["/path/to/swap/mcp/server.js"],
      "env": {
        "SWAP_SERVER_URL": "ws://localhost:7700"
      }
    }
  }
}
```

Run the SWAP server before launching agents:

```bash
node swap/server/index.js &
conductor start  # launches agents as normal
```

### For Conductor Itself (Future Integration)

If Conductor chose to integrate SWAP natively:
- Conductor launches the SWAP server as a managed subprocess before spawning agents
- Conductor's worktree manager registers each new worktree with SWAP on creation
- Conductor's diff view pulls from SWAP's `SemanticDiff` stream to show real-time semantic changes alongside file-level diffs
- Conductor's merge UI highlights symbols that had negotiation conflicts, flagging them for human review

---

## 13. Repository Structure

Final file tree for the shipped repository:

```
swap/
├── package.json
├── tsconfig.json
├── README.md
├── server/
│   ├── index.ts
│   ├── registry.ts
│   ├── intent.ts
│   ├── negotiate.ts
│   ├── diff-stream.ts
│   └── router.ts
├── parser/
│   ├── index.ts
│   ├── tree-sitter.ts
│   ├── symbol-extractor.ts
│   ├── diff.ts
│   └── languages/
│       ├── typescript.ts
│       ├── python.ts
│       ├── go.ts
│       └── rust.ts
├── mcp/
│   ├── server.ts
│   ├── tools.ts
│   └── schema.ts
├── shared/
│   ├── types.ts
│   ├── protocol.ts
│   └── constants.ts
├── demo/
│   ├── run.sh
│   ├── agent_a.md
│   ├── agent_b.md
│   └── fixture/
│       ├── src/
│       │   └── auth/
│       │       └── UserService.ts
│       └── package.json
└── docs/
    ├── design.md
    └── phases.md
```
