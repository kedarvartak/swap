#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
FIXTURE="$SCRIPT_DIR/fixture"
MCP_SERVER="$ROOT/mcp/server.ts"
AGENTS_DIR="$SCRIPT_DIR/agents"
CONFIGS_DIR="$SCRIPT_DIR/.mcp-configs"
LOG_DIR="$SCRIPT_DIR/logs"

COUNT="${1:-3}"

mkdir -p "$CONFIGS_DIR" "$LOG_DIR"

ts() { date '+%H:%M:%S'; }

cleanup() {
  rm -rf "$CONFIGS_DIR"
}
trap cleanup EXIT

echo "[$(ts)] Killing any existing process on port 7700..."
fuser -k 7700/tcp 2>/dev/null || true
sleep 0.5

echo "[$(ts)] Starting SWAP server on ws://localhost:7700..."
node --loader ts-node/esm "$ROOT/server/index.ts" \
  2>&1 | grep -v ExperimentalWarning | grep -v DEP0180 | grep -v "trace-warnings" | grep -v "Use node" \
  | tee "$LOG_DIR/swap-server.log" | sed 's/^/[SWAP] /' &
SERVER_PID=$!
disown $SERVER_PID
sleep 2

echo "[$(ts)] SWAP server up. Spawning $COUNT agents..."
echo ""

PIDS=()

for i in $(seq 1 "$COUNT"); do
  CONFIG="$CONFIGS_DIR/agent-${i}.json"
  AGENT_LOG="$LOG_DIR/agent-${i}.log"

  cat > "$CONFIG" <<EOF
{
  "mcpServers": {
    "swap": {
      "command": "node",
      "args": ["--loader", "ts-node/esm", "$MCP_SERVER"],
      "env": {
        "SWAP_SERVER_URL": "ws://localhost:7700",
        "SWAP_AGENT_ID": "Agent-$i",
        "SWAP_AGENT_TASK": "Agent $i task",
        "SWAP_WORKTREE_PATH": "$FIXTURE"
      }
    }
  }
}
EOF

  echo "[$(ts)] Launching Agent $i → logs/agent-${i}.log"

  claude \
    --dangerously-skip-permissions \
    --model claude-sonnet-4-6 \
    --mcp-config "$CONFIG" \
    --add-dir "$FIXTURE" \
    -p "$(cat "$AGENTS_DIR/agent${i}.md")" \
    < /dev/null > "$AGENT_LOG" 2>&1 &

  PIDS+=($!)
  sleep 0.3
done

echo ""
echo "[$(ts)] All $COUNT agents launched. Tailing logs..."
echo ""

for pid in "${PIDS[@]}"; do
  wait "$pid"
  code=$?
  for i in "${!PIDS[@]}"; do
    if [[ "${PIDS[$i]}" == "$pid" ]]; then
      agent_num=$((i + 1))
      if [[ $code -eq 0 ]]; then
        echo "[$(ts)] Agent $agent_num finished successfully"
      else
        echo "[$(ts)] Agent $agent_num exited with code $code — check logs/agent-${agent_num}.log"
      fi
    fi
  done
done

echo ""
echo "[$(ts)] Done. Logs in: $LOG_DIR/"
echo "[$(ts)] SWAP server still on :7700 — stop with: fuser -k 7700/tcp"
