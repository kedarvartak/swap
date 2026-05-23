import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { decode, encode } from '../shared/protocol.js';
import type {
  RegisterPayload,
  StatusUpdatePayload,
  BroadcastIntentPayload,
} from '../shared/protocol.js';
import { AgentRegistry } from './registry.js';
import { MessageRouter } from './router.js';
import {
  SERVER_PORT,
  HEARTBEAT_INTERVAL_MS,
  REGISTRATION_TIMEOUT_MS,
} from '../shared/constants.js';

const registry = new AgentRegistry();
const router = new MessageRouter(registry);

const wss = new WebSocketServer({ port: SERVER_PORT });

console.log(`[SWAP] Server listening on ws://localhost:${SERVER_PORT}`);

wss.on('connection', (ws) => {
  const connectionId = uuid();
  let registeredId: string | null = null;

  // Agent must REGISTER within REGISTRATION_TIMEOUT_MS or connection drops
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

    // ── REGISTER ────────────────────────────────────────────────────────────
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

      router.send(agentId, {
        id: uuid(),
        type: 'REGISTERED',
        payload: { agentId },
      });

      router.broadcast(
        {
          id: uuid(),
          type: 'AGENT_JOINED',
          payload: { agentId, taskDescription: payload.taskDescription, worktreePath: payload.worktreePath },
        },
        agentId
      );

      console.log(`[SWAP] Agent registered: ${agentId} — "${payload.taskDescription}"`);
      return;
    }

    // All subsequent messages require registration
    if (!registeredId) {
      ws.send(encode({ id: uuid(), type: 'ERROR', payload: { code: 'NOT_REGISTERED', message: 'Send REGISTER first' } }));
      return;
    }

    // ── PING ────────────────────────────────────────────────────────────────
    if (msg.type === 'PING') {
      registry.updateHeartbeat(registeredId);
      router.send(registeredId, { id: uuid(), type: 'PONG', payload: {} });
      return;
    }

    // ── LIST_AGENTS ─────────────────────────────────────────────────────────
    if (msg.type === 'LIST_AGENTS') {
      const agents = registry.getAll().map((a) => ({
        id: a.id,
        taskDescription: a.taskDescription,
        status: a.status,
        claims: a.claims,
      }));
      router.send(registeredId, {
        id: uuid(),
        type: 'AGENT_LIST',
        payload: { agents, totalActive: agents.length },
      });
      return;
    }

    // ── STATUS_UPDATE ────────────────────────────────────────────────────────
    if (msg.type === 'STATUS_UPDATE') {
      const payload = msg.payload as StatusUpdatePayload;
      registry.updateStatus(registeredId, payload.status);
      return;
    }

    // ── BROADCAST_INTENT ────────────────────────────────────────────────────
    if (msg.type === 'BROADCAST_INTENT') {
      const payload = msg.payload as BroadcastIntentPayload;
      router.broadcast(
        {
          id: uuid(),
          type: 'PEER_INTENT',
          payload: { agentId: registeredId, description: payload.description, filePaths: payload.filePaths },
        },
        registeredId
      );
      router.send(registeredId, { id: uuid(), type: 'PONG', payload: { delivered: registry.getAll().length - 1 } });
      return;
    }

    // Unknown message type — log and ignore rather than crash
    console.warn(`[SWAP] Unknown message type "${msg.type}" from ${registeredId}`);
  });

  ws.on('close', () => {
    if (!registeredId) return;
    console.log(`[SWAP] Agent disconnected: ${registeredId}`);
    registry.remove(registeredId);
    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId: registeredId } });
  });

  ws.on('error', (err) => {
    console.error(`[SWAP] WebSocket error for ${registeredId ?? connectionId}:`, err.message);
  });
});

// ── Heartbeat watchdog ───────────────────────────────────────────────────────
setInterval(() => {
  const stale = registry.pruneStale();
  for (const agentId of stale) {
    console.warn(`[SWAP] Pruned stale agent: ${agentId}`);
    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId } });
  }
}, HEARTBEAT_INTERVAL_MS);
