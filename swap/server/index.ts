import fs from 'node:fs';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { decode, encode } from '../shared/protocol.js';
import type {
  RegisterPayload,
  StatusUpdatePayload,
  BroadcastIntentPayload,
  ClaimPayload,
  ReleasePayload,
  NegotiatePayload,
} from '../shared/protocol.js';
import { AgentRegistry } from './registry.js';
import { MessageRouter } from './router.js';
import { IntentRegistry } from './intent.js';
import { DependencyGraph } from './graph.js';
import { NegotiationManager, computePriority } from './negotiate.js';
import { SnapshotStore } from '../parser/diff.js';
import { extractFull } from '../parser/symbol-extractor.js';
import {
  SERVER_PORT,
  DEFAULT_SERVER_SOCKET_PATH,
  HEARTBEAT_INTERVAL_MS,
  REGISTRATION_TIMEOUT_MS,
  CLAIM_TTL_MS,
} from '../shared/constants.js';

const registry    = new AgentRegistry();
const router      = new MessageRouter(registry);
const intentReg   = new IntentRegistry();
const graph       = new DependencyGraph();
const negotiator  = new NegotiationManager();
const snapshots   = new SnapshotStore();

// Track pending negotiation responses: agentId → { sessionId, resolve }
const pendingNegotiations = new Map<string, string>(); // agentId → sessionId

const wss = new WebSocketServer({ port: SERVER_PORT });
console.log(`[SWAP] Server listening on ws://localhost:${SERVER_PORT}`);

try {
  if (fs.existsSync(DEFAULT_SERVER_SOCKET_PATH)) fs.unlinkSync(DEFAULT_SERVER_SOCKET_PATH);
  const socketServer = http.createServer();
  const socketWss = new WebSocketServer({ server: socketServer });
  socketWss.on('connection', handleConnection);
  socketServer.listen(DEFAULT_SERVER_SOCKET_PATH, () => {
    fs.chmodSync(DEFAULT_SERVER_SOCKET_PATH, 0o600);
    console.log(`[SWAP] Server listening on unix://${DEFAULT_SERVER_SOCKET_PATH}`);
  });
} catch (err) {
  console.warn(`[SWAP] Unix socket unavailable, using TCP only: ${err instanceof Error ? err.message : String(err)}`);
}

wss.on('connection', handleConnection);

function handleConnection(ws: WebSocket) {
  const connectionId = uuid();
  let registeredId: string | null = null;
  let clientKind: 'mcp' | 'hook' = 'mcp';

  const registrationTimer = setTimeout(() => {
    if (!registeredId) {
      console.warn(`[SWAP] Connection ${connectionId} timed out`);
      ws.close(4001, 'Registration timeout');
    }
  }, REGISTRATION_TIMEOUT_MS);

  ws.on('message', (raw) => {
    let msg;
    try { msg = decode(raw.toString()); }
    catch {
      ws.send(encode({ id: uuid(), type: 'ERROR', payload: { code: 'INVALID_JSON', message: 'Could not parse message' } }));
      return;
    }

    // ── REGISTER ─────────────────────────────────────────────────────────────
    if (msg.type === 'REGISTER') {
      clearTimeout(registrationTimer);
      const p = msg.payload as RegisterPayload;
      const agentId = p.agentId || uuid();
      registeredId = agentId;
      clientKind = p.clientKind ?? 'mcp';

      const reconnecting = registry.has(agentId);
      if (reconnecting) {
        registry.updateConnection(agentId, ws);
      } else {
        registry.add({ id: agentId, ws, clientKind, worktreePath: p.worktreePath, taskDescription: p.taskDescription,
          status: 'idle', connectedAt: Date.now(), lastHeartbeat: Date.now(),
          claims: intentReg.getClaims(agentId), recentDiffs: [] });
      }
      intentReg.registerAgent(agentId, p.taskDescription);

      router.send(agentId, { id: uuid(), type: 'REGISTERED', payload: { agentId } });
      router.broadcast({ id: uuid(), type: reconnecting ? 'AGENT_RECONNECTED' : 'AGENT_JOINED',
        payload: { agentId, taskDescription: p.taskDescription, worktreePath: p.worktreePath } }, agentId);

      console.log(`[SWAP] Agent ${reconnecting ? 'reconnected' : 'registered'}: ${agentId} — "${p.taskDescription}"`);
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
        id: a.id, taskDescription: a.taskDescription, status: a.status,
        claims: intentReg.getClaims(a.id),
      }));
      router.send(registeredId, { id: uuid(), type: 'AGENT_LIST', payload: { agents, totalActive: agents.length } });
      return;
    }

    // ── STATUS_UPDATE ─────────────────────────────────────────────────────────
    if (msg.type === 'STATUS_UPDATE') {
      registry.updateStatus(registeredId, (msg.payload as StatusUpdatePayload).status);
      return;
    }

    // ── BROADCAST_INTENT ──────────────────────────────────────────────────────
    if (msg.type === 'BROADCAST_INTENT') {
      const p = msg.payload as BroadcastIntentPayload;
      router.broadcast({ id: uuid(), type: 'PEER_INTENT',
        payload: { agentId: registeredId, description: p.description, filePaths: p.filePaths } }, registeredId);
      router.send(registeredId, { id: uuid(), type: 'PONG', payload: { delivered: registry.getAll().length - 1 } });
      return;
    }

    // ── CLAIM ─────────────────────────────────────────────────────────────────
    if (msg.type === 'CLAIM') {
      const p = msg.payload as ClaimPayload;
      const claimerId = registeredId; // capture for async callbacks
      const result = intentReg.claim(claimerId, p.filePath, p.symbolName, p.intent, p.estimatedMinutes);

      if (result.granted) {
        registry.addClaim(registeredId, result.claim);
        console.log(`[SWAP] CLAIM GRANTED${p.source === 'hook' ? ' [hook]' : ''}: ${registeredId.slice(0,8)} → ${p.symbolName} (${p.intent})`);
        router.send(registeredId, { id: uuid(), type: 'CLAIM_GRANTED',
          payload: { filePath: p.filePath, symbolName: p.symbolName, claimId: result.claim.key } });
      } else {
        if (p.source === 'hook') {
          const suggestion = getAlternativeSuggestion(p.filePath, p.symbolName, claimerId);
          console.log(`[SWAP] CLAIM CONFLICT [hook]: ${registeredId.slice(0,8)} on ${p.symbolName}`);
          router.send(registeredId, { id: uuid(), type: 'CLAIM_CONFLICT',
            payload: { filePath: p.filePath, symbolName: p.symbolName,
              heldBy: result.conflict.heldBy, heldByTask: result.conflict.heldByTask,
              intent: result.conflict.intent, suggestion } });
          return;
        }

        // Trigger negotiation instead of flat rejection
        const holderAgent = registry.get(result.conflict.heldBy);
        const requesterAgent = registry.get(registeredId);

        if (holderAgent && requesterAgent) {
          const holderClaims = intentReg.getClaimsForSymbol(p.filePath, p.symbolName);
          const holderClaim = holderClaims.find((c) => c.agentId === holderAgent.id);

          if (holderClaim) {
            // Create a provisional claim for requester so we can score them
            const provisionalClaim = {
              key: `${p.filePath}::${p.symbolName}`,
              filePath: p.filePath, symbolName: p.symbolName,
              intent: p.intent, agentId: registeredId,
              claimedAt: Date.now(), estimatedRelease: Date.now() + 30 * 60 * 1000,
              priority: computePriority(requesterAgent, { key: `${p.filePath}::${p.symbolName}`,
                filePath: p.filePath, symbolName: p.symbolName, intent: p.intent,
                agentId: registeredId, claimedAt: Date.now(),
                estimatedRelease: Date.now() + 30 * 60 * 1000, priority: 0.5 }, graph),
            };

            console.log(`[SWAP] NEGOTIATION: ${registeredId.slice(0,8)} vs ${holderAgent.id.slice(0,8)} on ${p.symbolName}`);

            // Run negotiation async — don't block the message handler
            negotiator.negotiate(
              p.filePath, p.symbolName,
              holderAgent, requesterAgent,
              holderClaim, provisionalClaim,
              graph,
              (agentId, m) => router.send(agentId, m as Parameters<typeof router.send>[1])
            ).then((result) => {
              const winnerAgent = registry.get(result.winner);
              const loserAgent  = registry.get(result.loser);

              if (result.winner === registeredId) {
                // Requester wins — transfer claim
                intentReg.release(holderAgent.id, p.filePath, p.symbolName);
                registry.removeClaim(holderAgent.id, p.filePath, p.symbolName);
                const granted = intentReg.claim(claimerId, p.filePath, p.symbolName, p.intent);
                if (granted.granted) registry.addClaim(registeredId, granted.claim);

                router.send(result.winner, { id: uuid(), type: 'CLAIM_GRANTED',
                  payload: { filePath: p.filePath, symbolName: p.symbolName, claimId: provisionalClaim.key } });

                // Suggest unclaimed symbols in same file for loser
                const suggestion = getAlternativeSuggestion(p.filePath, p.symbolName, result.loser);
                router.send(result.loser, { id: uuid(), type: 'DEFER',
                  payload: { filePath: p.filePath, symbolName: p.symbolName,
                    deferTo: result.winner, suggestion } });
              } else {
                // Holder keeps the claim — requester deferred
                const suggestion = getAlternativeSuggestion(p.filePath, p.symbolName, claimerId);
                router.send(result.loser, { id: uuid(), type: 'DEFER',
                  payload: { filePath: p.filePath, symbolName: p.symbolName,
                    deferTo: result.winner, suggestion } });
              }

              console.log(`[SWAP] NEGOTIATION RESOLVED: winner=${result.winner.slice(0,8)} (${result.reason})`);
            }).catch((err) => {
              console.error('[SWAP] Negotiation error:', err);
              // Fallback: holder keeps claim
              router.send(claimerId, { id: uuid(), type: 'CLAIM_CONFLICT',
                payload: { filePath: p.filePath, symbolName: p.symbolName,
                  heldBy: holderAgent.id, heldByTask: holderAgent.taskDescription,
                  intent: holderClaim.intent } });
            });

            return; // negotiation result will be sent async
          }
        }

        // Fallback if agents not found
        console.log(`[SWAP] CLAIM CONFLICT (no negotiation): ${registeredId.slice(0,8)} on ${p.symbolName}`);
        router.send(registeredId, { id: uuid(), type: 'CLAIM_CONFLICT',
          payload: { filePath: p.filePath, symbolName: p.symbolName,
            heldBy: result.conflict.heldBy, heldByTask: result.conflict.heldByTask,
            intent: result.conflict.intent } });
      }
      return;
    }

    // ── NEGOTIATE ─────────────────────────────────────────────────────────────
    if (msg.type === 'NEGOTIATE') {
      const p = msg.payload as NegotiatePayload & { sessionId: string };
      if (p.sessionId) {
        negotiator.receiveNegotiateResponse(p.sessionId, registeredId, p.priority, p.justification);
      }
      return;
    }

    // ── RELEASE ───────────────────────────────────────────────────────────────
    if (msg.type === 'RELEASE') {
      const p = msg.payload as ReleasePayload;
      const released = intentReg.release(registeredId, p.filePath, p.symbolName);
      registry.removeClaim(registeredId, p.filePath, p.symbolName);

      // Semantic diff + graph update if source provided
      if (p.newSource && released) {
        const { symbols, edges } = extractFull(p.newSource, p.filePath);
        graph.updateFromEdges(edges);

        const diff = snapshots.diff(p.filePath, p.newSource, registeredId);
        if (diff.changes.length > 0) {
          // Attach affected symbols from graph
          for (const change of diff.changes) {
            const key = `${p.filePath}::${change.symbolName}`;
            change.affectedSymbols = Array.from(graph.getTransitiveDependents(key)).slice(0, 10);
          }

          registry.addDiff(registeredId, diff);
          router.broadcast({ id: uuid(), type: 'PEER_DIFF', payload: diff }, registeredId);
          console.log(`[SWAP] DIFF: ${diff.changes.length} change(s) in ${p.filePath} (${diff.stats.breaking} breaking)`);
        }
      }

      router.send(registeredId, { id: uuid(), type: 'RELEASE_ACK',
        payload: { filePath: p.filePath, symbolName: p.symbolName } });
      return;
    }

    console.warn(`[SWAP] Unknown message type "${msg.type}" from ${registeredId}`);
  });

  ws.on('close', () => {
    if (!registeredId) return;
    console.log(`[SWAP] Agent disconnected: ${registeredId.slice(0,8)}`);
    if (clientKind === 'hook') {
      registry.updateStatus(registeredId, 'disconnected');
      return;
    }
    const released = intentReg.releaseAll(registeredId);
    intentReg.unregisterAgent(registeredId);
    registry.remove(registeredId);
    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId: registeredId } });
    if (released.length > 0) {
      router.broadcast({ id: uuid(), type: 'CLAIMS_RELEASED', payload: { agentId: registeredId, released } });
    }
  });

  ws.on('error', (err) => {
    console.error(`[SWAP] WS error for ${registeredId?.slice(0,8) ?? connectionId}:`, err.message);
  });
}

function getAlternativeSuggestion(filePath: string, conflictSymbol: string, forAgentId: string): string {
  const allClaims = intentReg.getAllClaims();
  const claimedByOthers = new Set(
    allClaims.filter((c) => c.agentId !== forAgentId).map((c) => c.symbolName)
  );
  // Suggest any symbol in the same file not currently claimed
  const snapshot = snapshots.get(filePath);
  if (!snapshot) return `Try working on other files while ${conflictSymbol} is in use`;
  const unclaimed = snapshot.symbols.filter((s) => !claimedByOthers.has(s.name) && s.name !== conflictSymbol);
  if (unclaimed.length === 0) return `All symbols in ${filePath} are currently claimed`;
  return `Consider working on: ${unclaimed.slice(0, 3).map((s) => `${s.kind} \`${s.name}\``).join(', ')}`;
}

// ── Heartbeat watchdog ────────────────────────────────────────────────────────
setInterval(() => {
  const stale = registry.pruneStale();
  for (const agentId of stale) {
    console.warn(`[SWAP] Pruned stale: ${agentId.slice(0,8)}`);
    const released = intentReg.releaseAll(agentId);
    intentReg.unregisterAgent(agentId);
    router.broadcast({ id: uuid(), type: 'AGENT_LEFT', payload: { agentId } });
    if (released.length > 0) {
      router.broadcast({ id: uuid(), type: 'CLAIMS_RELEASED', payload: { agentId, released } });
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// ── Claim TTL watchdog ────────────────────────────────────────────────────────
setInterval(() => {
  const expired = intentReg.pruneExpired();
  for (const { agentId, filePath, symbolName } of expired) {
    console.warn(`[SWAP] TTL expired: ${agentId.slice(0,8)} → ${symbolName}`);
    registry.removeClaim(agentId, filePath, symbolName);
  }
}, CLAIM_TTL_MS / 10);
