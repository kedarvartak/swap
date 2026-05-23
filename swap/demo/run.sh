#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

cleanup() {
  echo ""
  echo "[demo] Shutting down SWAP server..."
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          SWAP — Multi-Agent Coordination Demo        ║"
echo "║  Two agents. One codebase. Zero merge conflicts.     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Start SWAP server
node --loader ts-node/esm "$ROOT/server/index.ts" 2>&1 | sed 's/^/[SWAP] /' &
SERVER_PID=$!
sleep 1.5

echo "[demo] SWAP server online. Launching agents..."
echo ""

# Agent A — adds rate limiting
SWAP_AGENT_TASK="Add rate limiting to authentication flow" \
SWAP_WORKTREE_PATH="$SCRIPT_DIR/worktree-a" \
  claude --model claude-sonnet-4-6 \
         --dangerously-skip-permissions \
         --mcp-config "$ROOT/mcp-config.json" \
         --add-dir "$SCRIPT_DIR/fixture" \
         -p "$(cat "$SCRIPT_DIR/agent_a.md")" \
         2>&1 | sed 's/^/[Agent A] /' &
PID_A=$!

# Agent B — refactors dependency injection
SWAP_AGENT_TASK="Refactor UserService with dependency injection" \
SWAP_WORKTREE_PATH="$SCRIPT_DIR/worktree-b" \
  claude --model claude-sonnet-4-6 \
         --dangerously-skip-permissions \
         --mcp-config "$ROOT/mcp-config.json" \
         --add-dir "$SCRIPT_DIR/fixture" \
         -p "$(cat "$SCRIPT_DIR/agent_b.md")" \
         2>&1 | sed 's/^/[Agent B] /' &
PID_B=$!

echo "[demo] Agent A PID: $PID_A"
echo "[demo] Agent B PID: $PID_B"
echo ""

wait $PID_A
wait $PID_B

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Demo complete. Both agents coordinated via SWAP.    ║"
echo "╚══════════════════════════════════════════════════════╝"
