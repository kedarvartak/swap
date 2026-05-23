#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
FIXTURE="$SCRIPT_DIR/fixture"
MCP_SERVER="$ROOT/mcp/server.ts"
AGENTS_DIR="$SCRIPT_DIR/agents"
CONFIGS_DIR="$SCRIPT_DIR/.mcp-configs"
LOG_DIR="$SCRIPT_DIR/logs"

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

echo "[$(ts)] SWAP server up (PID $SERVER_PID). Spawning 10 agents..."
echo ""

PIDS=()

for i in $(seq 1 10); do
  CONFIG="$CONFIGS_DIR/agent-${i}.json"
  AGENT_LOG="$LOG_DIR/agent-${i}.log"

  # Derive task name from first line of the agent prompt
  TASK=$(head -1 "$AGENTS_DIR/agent${i}.md" | sed 's/You are Agent [0-9]* working on .*//' | xargs)

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

  echo "[$(ts)] Launching Agent $i → log: logs/agent-${i}.log"

  claude \
    --dangerously-skip-permissions \
    --model claude-sonnet-4-6 \
    --no-update-check \
    --mcp-config "$CONFIG" \
    --add-dir "$FIXTURE" \
    -p "$(cat "$AGENTS_DIR/agent${i}.md")" \
    < /dev/null > "$AGENT_LOG" 2>&1 &

  PIDS+=($!)
  sleep 0.3
done

echo ""
echo "[$(ts)] All 10 agents launched. Watching logs in real time:"
echo "[$(ts)] (tail -f logs/agent-*.log in another terminal for per-agent detail)"
echo ""

# Stream all agent logs with agent prefix
tail -f "$LOG_DIR"/agent-*.log --pid=${PIDS[0]} 2>/dev/null | sed 's|==> .*/agent-\([0-9]*\)\.log <==|── Agent \1 ──|' &

for pid in "${PIDS[@]}"; do
  wait "$pid"
  code=$?
  for i in "${!PIDS[@]}"; do
    if [[ "${PIDS[$i]}" == "$pid" ]]; then
      agent_num=$((i + 1))
      if [[ $code -eq 0 ]]; then
        echo "[$(ts)] ✓ Agent $agent_num finished"
      else
        echo "[$(ts)] ✗ Agent $agent_num exited with code $code — check logs/agent-${agent_num}.log"
      fi
    fi
  done
done

echo ""
echo "[$(ts)] All agents done. SWAP server still running on :7700"
echo "[$(ts)] Full logs in: $LOG_DIR/"
echo "[$(ts)] Stop server: fuser -k 7700/tcp"
