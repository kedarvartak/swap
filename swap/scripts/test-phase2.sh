#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
PASS=0; FAIL=0

log()  { echo "  $1"; }
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " SWAP Phase 2 Smoke Test — Intent Registry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node --loader ts-node/esm "$ROOT/server/index.ts" 2>/dev/null &
SERVER_PID=$!
sleep 2

node --input-type=module << 'EOF'
import { WebSocket } from 'ws';

function makeAgent(task) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:7700');
    let agentId;
    const handlers = {};

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: crypto.randomUUID(), type: 'REGISTER', timestamp: Date.now(),
        payload: { worktreePath: `/tmp/${task.replace(/ /g,'_')}`, taskDescription: task } }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') agentId = msg.payload.agentId;
      if (handlers[msg.type]) handlers[msg.type](msg);
    });

    ws.send_ = (type, payload) => ws.send(JSON.stringify({ id: crypto.randomUUID(), type, timestamp: Date.now(), payload }));

    ws.waitFor = (type) => new Promise((res) => {
      handlers[type] = (msg) => { delete handlers[type]; res(msg); };
    });

    ws.on('open', () => {});
    ws.ready = new Promise((res) => { ws.on('message', function h(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') { ws.removeListener('message', h); res(ws); agentId_ = msg.payload.agentId; }
    }); });
    let agentId_;
    ws.getId = () => agentId_ ?? agentId;
    resolve(ws);
  });
}

await new Promise(r => setTimeout(r, 200));

const agentA = await makeAgent('Build OAuth flow');
const agentB = await makeAgent('Refactor UserService');
await new Promise(r => setTimeout(r, 500));

// ── Test 1: Agent A claims a symbol → GRANTED ─────────────────────────────
agentA.send(JSON.stringify({ id: 'claim-1', type: 'CLAIM', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'authenticate', intent: 'write' } }));

const grantA = await new Promise(res => agentA.once('message', (raw) => res(JSON.parse(raw.toString()))));

if (grantA.type === 'CLAIM_GRANTED') {
  console.log('✓ Test 1: Agent A claim granted for authenticate()');
} else {
  console.log('✗ Test 1: Expected CLAIM_GRANTED, got', grantA.type);
  process.exit(1);
}

// ── Test 2: Agent B claims same symbol → CONFLICT ─────────────────────────
agentB.send(JSON.stringify({ id: 'claim-2', type: 'CLAIM', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'authenticate', intent: 'write' } }));

const conflictB = await new Promise(res => agentB.once('message', (raw) => res(JSON.parse(raw.toString()))));

if (conflictB.type === 'CLAIM_CONFLICT') {
  console.log('✓ Test 2: Agent B correctly received CLAIM_CONFLICT');
  console.log(`  held by: "${conflictB.payload.heldByTask}", intent: ${conflictB.payload.intent}`);
} else {
  console.log('✗ Test 2: Expected CLAIM_CONFLICT, got', conflictB.type);
  process.exit(1);
}

// ── Test 3: Agent A releases → Agent B can now claim ─────────────────────
agentA.send(JSON.stringify({ id: 'rel-1', type: 'RELEASE', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'authenticate' } }));

await new Promise(r => setTimeout(r, 300));

agentB.send(JSON.stringify({ id: 'claim-3', type: 'CLAIM', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'authenticate', intent: 'write' } }));

const grantB = await new Promise(res => agentB.once('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'RELEASE_ACK') {
    // this was the ack for agent A — wait for next message
    agentB.once('message', (raw2) => res(JSON.parse(raw2.toString())));
  } else {
    res(msg);
  }
}));

if (grantB.type === 'CLAIM_GRANTED') {
  console.log('✓ Test 3: Agent B claimed authenticate() after Agent A released');
} else {
  console.log('✗ Test 3: Expected CLAIM_GRANTED after release, got', grantB.type);
  process.exit(1);
}

// ── Test 4: Multiple read claims coexist ─────────────────────────────────
agentA.send(JSON.stringify({ id: 'claim-4', type: 'CLAIM', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'login', intent: 'read' } }));
const readA = await new Promise(res => agentA.once('message', (raw) => res(JSON.parse(raw.toString()))));

agentB.send(JSON.stringify({ id: 'claim-5', type: 'CLAIM', timestamp: Date.now(),
  payload: { filePath: 'src/auth/UserService.ts', symbolName: 'login', intent: 'read' } }));
const readB = await new Promise(res => agentB.once('message', (raw) => res(JSON.parse(raw.toString()))));

if (readA.type === 'CLAIM_GRANTED' && readB.type === 'CLAIM_GRANTED') {
  console.log('✓ Test 4: Multiple read claims coexist on same symbol');
} else {
  console.log('✗ Test 4: Read coexistence failed:', readA.type, readB.type);
  process.exit(1);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Phase 2 complete. All 4 tests passed.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(0);
EOF
