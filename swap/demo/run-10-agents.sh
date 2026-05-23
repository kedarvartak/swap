#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
FIXTURE="$SCRIPT_DIR/fixture"
MCP_SERVER="$ROOT/mcp/server.ts"
AGENTS_DIR="$SCRIPT_DIR/agents"
CONFIGS_DIR="$SCRIPT_DIR/.mcp-configs"

mkdir -p "$CONFIGS_DIR"

cleanup() {
  rm -rf "$CONFIGS_DIR"
}
trap cleanup EXIT

# Start SWAP server and disown so it outlives this script
fuser -k 7700/tcp 2>/dev/null || true
node --loader ts-node/esm "$ROOT/server/index.ts" 2>&1 \
  | grep -v ExperimentalWarning \
  | grep -v DEP0180 \
  | grep -v "trace-warnings" \
  | grep -v "Use node" \
  | sed 's/^/[SWAP] /' &
SERVER_PID=$!
disown $SERVER_PID
sleep 2

PIDS=()

for i in $(seq 1 10); do
  CONFIG="$CONFIGS_DIR/agent-${i}.json"
  cat > "$CONFIG" <<EOF
{
  "mcpServers": {
    "swap": {
      "command": "node",
      "args": ["--loader", "ts-node/esm", "$MCP_SERVER"],
      "env": {
        "SWAP_SERVER_URL": "ws://localhost:7700",
        "SWAP_AGENT_ID": "Agent-$i",
        "SWAP_WORKTREE_PATH": "$FIXTURE"
      }
    }
  }
}
EOF

  claude \
    --dangerously-skip-permissions \
    --model claude-sonnet-4-6 \
    --mcp-config "$CONFIG" \
    --add-dir "$FIXTURE" \
    -p "$(cat "$AGENTS_DIR/agent${i}.md")" \
    < /dev/null 2>&1 | sed "s/^/[Agent $i] /" &

  PIDS+=($!)
  sleep 0.3
done

for pid in "${PIDS[@]}"; do
  wait "$pid" || true
done
