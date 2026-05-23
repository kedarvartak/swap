import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { decode, encode } from '../shared/protocol.js';
import type {
  RegisterPayload,
  StatusUpdatePayload,
  BroadcastIntentPayload,
  ClaimPayload,
  ReleasePayload,
} from '../shared/protocol.js';
import { AgentRegistry } from './registry.js';
import { MessageRouter } from './router.js';
import { IntentRegistry } from './intent.js';
import { SnapshotStore } from '../parser/diff.js';
import {
  SERVER_PORT,
  HEARTBEAT_INTERVAL_MS,
  REGISTRATION_TIMEOUT_MS,
  CLAIM_TTL_MS,
} from '../shared/constants.js';

const registry = new AgentRegistry();
const router = new MessageRouter(registry);
const intentRegistry = new IntentRegistry();
const snapshots = new SnapshotStore();

const wss = new WebSocketServer({ port: SERVER_PORT });

console.log(`[SWAP] Server listening on ws://localhost:${SERVER_PORT}`);

wss.on('connection', (ws) => {
  const connectionId = uuid();
  let registeredId: string | null = null;

  const registrationTimer = setTimeout(() => {
    if (!registeredId) {
      console.warn(`[SWAP] Connection ${connectionId} timed out without registering`);
      ws.close(4001, 'Registration timeout');
    }
  }, REGISTRATION_TIMEOUT_MS);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = decode(raw.toString());
    } catch {
      ws.send(encode({ id: uuid(), type: 'ERROR', payload: { code: 'INVALID_JSON', message: 'Could not parse message' } }));
      return;
    }

    // ── REGISTER ─────────────────────────────────────────────────────────────
    if (msg.type === 'REGISTER') {
      clearTimeout(registrationTimer);
      const payload = msg.payload as RegisterPayload;
      const agentId = uuid();
      registeredId = agentId;

      registry.add({
        id: agentId,
        ws,
        worktreePath: payload.worktreePath,
        taskDescription: payload.taskDescription,
        status: 'idle',
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        claims: [],
        recentDiffs: [],
      });
      intentRegistry.registerAgent(agentId, payload.taskDescription);

      router.send(agentId, { id: uuid(), type: 'REGISTERED', payload: { agentId } });
      router.broadcast(
        { id: uuid(), type: 'AGENT_JOINED', payload: { agentId, taskDescription: payload.taskDescription, worktreePath: payload.worktreePath } },
        agentId
      );

      console.log(`[SWAP] Agent registered: ${agentId} — "${payload.taskDescription}"`);
      return;
    }

    if (!registeredId) {
      ws.send(encode({ id: uuid(), type: 'ERROR', payload: { code: 'NOT_REGISTERED', message: 'Send REGISTER first' } }));
      return;
    }

    // ── PING ──────────────────────────────────────────────────────────────────
    if (msg.type === 'PING') {
      registry.updateHeartbeat(registeredId);
      router.send(registeredId, { id: uuid(), type: 'PONG', payload: {} });
      return;
    }

    // ── LIST_AGENTS ───────────────────────────────────────────────────────────
    if (msg.type === 'LIST_AGENTS') {
      const agents = registry.getAll().map((a) => ({
        id: a.id,
        taskDescription: a.taskDescription,
        status: a.status,
        claims: intentRegistry.getClaims(a.id),
      }));
      router.send(registeredId, { id: uuid(), type: 'AGENT_LIST', payload: { agents, totalActive: agents.length } });
      return;
    }

    // ── STATUS_UPDATE ─────────────────────────────────────────────────────────
    if (msg.type === 'STATUS_UPDATE') {
      const payload = msg.payload as StatusUpdatePayload;
      registry.updateStatus(registeredId, payload.status);
      return;
    }

    // ── BROADCAST_INTENT ──────────────────────────────────────────────────────
    if (msg.type === 'BROADCAST_INTENT') {
      const payload = msg.payload as BroadcastIntentPayload;
      router.broadcast(
        { id: uuid(), type: 'PEER_INTENT', payload: { agentId: registeredId, description: payload.description, filePaths: payload.filePaths } },
        registeredId
      );
      router.send(registeredId, { id: uuid(), type: 'PONG', payload: { delivered: registry.getAll().length - 1 } });
      return;
    }

    // ── CLAIM ─────────────────────────────────────────────────────────────────
    if (msg.type === 'CLAIM') {
      const payload = msg.payload as ClaimPayload;
      const result = intentRegistry.claim(
        registeredId,
        payload.filePath,
        payload.symbolName,
        payload.intent,
        payload.estimatedMinutes
      );

      if (result.granted) {
        registry.addClaim(registeredId, result.claim);
        console.log(`[SWAP] CLAIM GRANTED: ${registeredId} → ${payload.filePath}::${payload.symbolName} (${payload.intent})`);
        router.send(registeredId, {
          id: uuid(),
          type: 'CLAIM_GRANTED',
          payload: { filePath: payload.filePath, symbolName: payload.symbolName, claimId: result.claim.key },
        });
      } else {
        const agent = registry.get(result.conflict.heldBy);
        console.log(`[SWAP] CLAIM CONFLICT: ${registeredId} vs ${result.conflict.heldBy} on ${payload.symbolName}`);
        router.send(registeredId, {
          id: uuid(),
          type: 'CLAIM_CONFLICT',
          payload: {
            filePath: payload.filePath,
            symbolName: payload.symbolName,
            heldBy: result.conflict.heldBy,
            heldByTask: agent?.taskDescription ?? result.conflict.heldByTask,
            intent: result.conflict.intent,
          },
        });
      }
      return;
    }

    // ── RELEASE ───────────────────────────────────────────────────────────────
    if (msg.type === 'RELEASE') {
      const payload = msg.payload as ReleasePayload;
      const released = intentRegistry.release(registeredId, payload.filePath, payload.symbolName);
      registry.removeClaim(registeredId, payload.filePath, payload.symbolName);

      console.log(`[SWAP] RELEASE: ${registeredId} → ${payload.filePath}::${payload.symbolName}`);

      // If source provided, compute semantic diff and broadcast to peers
      if (payload.newSource && released) {
        const diff = snapshots.diff(payload.filePath, payload.newSource, registeredId);
        if (diff.changes.length > 0) {
          registry.addDiff(registeredId, diff);
          router.broadcast({ id: uuid(), type: 'PEER_DIFF', payload: diff }, registeredId);
          console.log(`[SWAP] DIFF emitted: ${diff.changes.length} change(s) in ${payload.filePath}`);
        }
      }

      router.send(registeredId, { id: uuid(), type: 'RELEASE_ACK', payload: { filePath: payload.filePath, symbolName: payload.symbolName } });
      return;
    }

    console.warn(`[SWAP] Unknown message type "${msg.type}" from ${registeredId}`);
  });

  ws.on('close', () => {
    if (!registeredId) return;
    console.log(`[SWAP] Agent disconnected: ${registeredId}`);
    const released = intentRegistry.releaseAll(registeredId);
    intentRegistry.unregisterAgent(registeredId);
    registry.remove(registeredId);

    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId: registeredId } });
    if (released.length > 0) {
      router.broadcast({ id: uuid(), type: 'CLAIMS_RELEASED', payload: { agentId: registeredId, released } });
    }
  });

  ws.on('error', (err) => {
    console.error(`[SWAP] WebSocket error for ${registeredId ?? connectionId}:`, err.message);
  });
});

// ── Heartbeat watchdog ────────────────────────────────────────────────────────
setInterval(() => {
  const stale = registry.pruneStale();
  for (const agentId of stale) {
    console.warn(`[SWAP] Pruned stale agent: ${agentId}`);
    const released = intentRegistry.releaseAll(agentId);
    intentRegistry.unregisterAgent(agentId);
    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId } });
    if (released.length > 0) {
      router.broadcast({ id: uuid(), type: 'CLAIMS_RELEASED', payload: { agentId, released } });
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// ── Claim TTL watchdog ────────────────────────────────────────────────────────
setInterval(() => {
  const expired = intentRegistry.pruneExpired();
  for (const { agentId, filePath, symbolName } of expired) {
    console.warn(`[SWAP] Claim TTL expired: ${agentId} → ${filePath}::${symbolName}`);
    registry.removeClaim(agentId, filePath, symbolName);
  }
}, CLAIM_TTL_MS / 10);
