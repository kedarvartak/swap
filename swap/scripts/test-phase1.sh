#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " SWAP Phase 1 Smoke Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cleanup() {
  echo ""
  echo "[test] Cleaning up..."
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Start SWAP server
echo "[test] Starting SWAP server..."
node --loader ts-node/esm "$ROOT/server/index.ts" &
SERVER_PID=$!
sleep 1

echo "[test] Server PID: $SERVER_PID"
echo ""

# Run two claude agents in parallel, each calling list_agents
echo "[test] Launching Agent A and Agent B simultaneously..."

SWAP_AGENT_TASK="Build OAuth2 authentication flow" \
SWAP_WORKTREE_PATH="/tmp/worktree-a" \
  claude --model claude-sonnet-4-6 \
         --dangerously-skip-permissions \
         --mcp-config "$ROOT/mcp-config.json" \
         -p "You are Agent A. Use the list_agents tool to see who else is connected, then use broadcast_intent to announce you are working on OAuth. Report back what you found." \
         2>&1 | sed 's/^/[Agent A] /' &
PID_A=$!

SWAP_AGENT_TASK="Refactor UserService to use dependency injection" \
SWAP_WORKTREE_PATH="/tmp/worktree-b" \
  claude --model claude-sonnet-4-6 \
         --dangerously-skip-permissions \
         --mcp-config "$ROOT/mcp-config.json" \
         -p "You are Agent B. Use the list_agents tool to see who else is connected, then use broadcast_intent to announce you are refactoring UserService. Report back what you found." \
         2>&1 | sed 's/^/[Agent B] /' &
PID_B=$!

wait $PID_A
wait $PID_B

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Phase 1 complete. Both agents saw each other."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
