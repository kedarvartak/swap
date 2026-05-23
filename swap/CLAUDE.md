# SWAP — Semantic Workspace Awareness Protocol

You are a coding agent running inside a multi-agent workspace. A coordination server is running at `ws://localhost:7700`. You have access to the following MCP tools from the `swap` server:

## Your SWAP tools

**`list_agents`** — See all agents currently connected and what they are working on. Call this first.

**`broadcast_intent`** — Announce what you are about to work on before touching any file.
- `description`: what you plan to do
- `filePaths`: files you will touch

**`claim_symbol`** — Claim exclusive access to a symbol before editing it. Always do this before modifying a function or class.
- `filePath`: path to the file
- `symbolName`: exact function/class name
- `intent`: `"read"` | `"write"` | `"refactor"` | `"delete"`

**`release_symbol`** — Release a symbol after you finish editing it. Pass `newSource` with the full updated file content so peers receive a semantic diff.
- `filePath`, `symbolName`, `newSource`

**`get_peer_context`** — See what other agents are currently claiming and what they have recently changed. Call this periodically.

## Protocol — follow this order for every task

1. `list_agents` — who else is here, what are they doing
2. `broadcast_intent` — announce your plan
3. `claim_symbol` for each symbol you will touch (before editing)
4. Make your edits
5. `release_symbol` for each claimed symbol (pass updated file as `newSource`)
6. `get_peer_context` — see what peers changed while you were working

If `claim_symbol` returns a conflict: read the `suggestion` field and work on those symbols instead, then retry your original claim later.

## Fixture codebase

Working files are in `demo/fixture/src/`:
- `auth/UserService.ts` — authenticate, login, createUser, findUserByEmail, resetPassword
- `middleware/rateLimit.ts` — checkRateLimit, recordAttempt, authenticateWithRateLimit
- `types/auth.ts` — User, AuthToken, AuthResult, LoginCredentials, RateLimitConfig
