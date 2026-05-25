import type { DashboardState, LogEvent, NegotiationRecord } from '../types/swap';

let logIdCounter = 100;
const newLogId = () => `l${++logIdCounter}`;

const extraLogMessages: Array<{ type: LogEvent['type']; agentShortId?: string; message: string }> = [
  { type: 'HEARTBEAT', agentShortId: 'a1b2', message: 'heartbeat from a1b2 — 3 active claims' },
  { type: 'HEARTBEAT', agentShortId: 'e5f6', message: 'heartbeat from e5f6 — 2 active claims' },
  { type: 'CLAIM',     agentShortId: 'a1b2', message: 'a1b2 claimed src/auth/middleware.ts::TokenCache [write]' },
  { type: 'HEARTBEAT', agentShortId: 'i9j0', message: 'heartbeat from i9j0 — 1 active claim' },
  { type: 'RELEASE',   agentShortId: 'a1b2', message: 'a1b2 released src/auth/middleware.ts::TokenCache' },
  { type: 'DIFF',      agentShortId: 'a1b2', message: 'semantic diff: src/auth/middleware.ts — 0 breaking changes' },
  { type: 'HEARTBEAT', agentShortId: 'm3n4', message: 'heartbeat from m3n4 — idle' },
  { type: 'CLAIM',     agentShortId: 'm3n4', message: 'm3n4 claimed src/inventory/schema.ts::StockLevel [write]' },
];

let msgIdx = 0;

function resolveActiveNegotiation(state: DashboardState): DashboardState {
  const active = state.negotiations.find((n) => n.active);
  if (!active) return state;

  const resolved: NegotiationRecord = {
    ...active,
    active: false,
    winner: active.priorityA >= active.priorityB ? active.agentA : active.agentB,
    loser:  active.priorityA >= active.priorityB ? active.agentB : active.agentA,
    reason: Math.abs(active.priorityA - active.priorityB) < 0.05 ? 'tie-break' : 'priority',
    resolvedAt: Date.now(),
  };

  const winner = resolved.winner!;
  const winPri = active.priorityA >= active.priorityB ? active.priorityA : active.priorityB;
  const losePri = active.priorityA >= active.priorityB ? active.priorityB : active.priorityA;

  const resolveLog: LogEvent = {
    id: newLogId(),
    timestamp: Date.now(),
    type: 'RESOLVE',
    agentShortId: winner,
    message: `resolved — winner: ${winner} [${resolved.reason} ${winPri.toFixed(2)} > ${losePri.toFixed(2)}]`,
  };

  return {
    ...state,
    negotiations: state.negotiations.map((n) => (n.sessionId === active.sessionId ? resolved : n)),
    log: [...state.log, resolveLog].slice(-60),
  };
}

function tickHeartbeats(state: DashboardState): DashboardState {
  const now = Date.now();
  return {
    ...state,
    agents: state.agents.map((a) =>
      a.status !== 'disconnected'
        ? { ...a, lastHeartbeat: now - Math.floor(Math.random() * 8000) }
        : a
    ),
  };
}

function appendLogMessage(state: DashboardState): DashboardState {
  const entry = extraLogMessages[msgIdx % extraLogMessages.length];
  msgIdx++;
  const logEvent: LogEvent = {
    id: newLogId(),
    timestamp: Date.now(),
    ...entry,
  };
  return { ...state, log: [...state.log, logEvent].slice(-60) };
}

export function tick(state: DashboardState): DashboardState {
  const t = state.tick;
  let next = { ...state, tick: t + 1 };

  next = tickHeartbeats(next);

  // Every 4 ticks: resolve active negotiation if any
  if (t % 4 === 0) {
    next = resolveActiveNegotiation(next);
  }

  // Every 3 ticks: add a log message
  if (t % 3 === 0) {
    next = appendLogMessage(next);
  }

  return next;
}
