#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SERVER_LOG="$TMP_DIR/swap-server.log"
LATENCIES="$TMP_DIR/latencies.txt"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/src"
cat > "$TMP_DIR/src/orders.ts" <<'TS'
export function createOrder(total: number) {
  return { id: "order_1", total };
}

export function cancelOrder(id: string) {
  return { id, cancelled: true };
}
TS

node --loader ts-node/esm "$ROOT/server/index.ts" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
sleep 1

hook_json() {
  local session="$1"
  cat <<JSON
{
  "hook_event_name": "PreToolUse",
  "session_id": "$session",
  "cwd": "$TMP_DIR",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "src/orders.ts",
    "old_string": "return { id: \\"order_1\\", total };",
    "new_string": "return { id: \\"order_1\\", total, status: \\"created\\" };"
  }
}
JSON
}

run_pre() {
  local session="$1"
  output="$(hook_json "$session" | SWAP_HOOK_LATENCY_FILE="$LATENCIES" SWAP_HOOK_TIMEOUT_MS=1000 SWAP_COORDINATION_MODE="${SWAP_COORDINATION_MODE:-strict}" node --loader ts-node/esm "$ROOT/hooks/cli.ts" pre)"
  printf '%s\n' "$output"
}

run_post() {
  local session="$1"
  hook_json "$session" | SWAP_HOOK_TIMEOUT_MS=1000 node --loader ts-node/esm "$ROOT/hooks/cli.ts" post >/dev/null
}

FIRST="$(run_pre agent-1)"
SECOND="$(run_pre agent-2)"

if ! grep -q '"permissionDecision":"allow"' <<< "$FIRST"; then
  echo "Expected first hook edit to be allowed"
  echo "$FIRST"
  exit 1
fi

if ! grep -q '"permissionDecision":"deny"' <<< "$SECOND"; then
  echo "Expected second strict-mode hook edit to be denied"
  echo "$SECOND"
  exit 1
fi

perl -0pi -e 's/return \{ id: "order_1", total \};/return { id: "order_1", total, status: "created" };/g' "$TMP_DIR/src/orders.ts"
run_post agent-1

SWAP_COORDINATION_MODE=advisory THIRD="$(run_pre agent-3)"
SWAP_COORDINATION_MODE=advisory FOURTH="$(run_pre agent-4)"

if ! grep -q '"permissionDecision":"allow"' <<< "$THIRD$FOURTH"; then
  echo "Expected advisory-mode hook conflicts to allow edits"
  exit 1
fi

if ! grep -q 'CLAIM GRANTED.*createOrder' "$SERVER_LOG"; then
  echo "Expected auto-claim grant in server log"
  cat "$SERVER_LOG"
  exit 1
fi

if ! grep -q 'CLAIM CONFLICT.*createOrder' "$SERVER_LOG"; then
  echo "Expected auto-claim conflict in server log"
  cat "$SERVER_LOG"
  exit 1
fi

sort -n "$LATENCIES" | awk '
  { values[NR]=$1 }
  END {
    if (NR == 0) exit 1;
    p50=values[int((NR+1)/2)];
    p95=values[int(NR*0.95)];
    printf("PreToolUse latency ms: count=%d p50=%d p95=%d max=%d\n", NR, p50, p95, values[NR]);
  }
'

echo "Phase A hook enforcement test passed"
