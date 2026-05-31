import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  DashboardState,
  AgentRecord,
  SymbolClaim,
  SemanticDiff,
  LogEvent,
} from '../types/swap';
import { buildInitialState } from '../data/mockData';
import { tick as mockTick } from '../data/simulator';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

const SWAP_URL = 'ws://localhost:7700';
const POLL_INTERVAL_MS = 3000;
const MAX_DIFFS = 30;
const MAX_LOG = 100;
const MAX_RETRY_DELAY_MS = 30_000;

let logSeq = 5000;
const lid = () => `ws-${++logSeq}`;

// ─── ID helpers ──────────────────────────────────────────────────────────────

function toShortId(agentId: string): string {
  // Server IDs are "agt-<uuid>" — take first 4 chars of the uuid segment
  const parts = agentId.split('-');
  const segment = parts.length >= 2 ? parts[1] : agentId;
  return segment.slice(0, 4);
}

// ─── Server-side shapes (what the wire actually sends) ────────────────────────

interface ServerClaim {
  key: string;
  filePath: string;
  symbolName: string;
  symbolKind?: string;
  intent: string;
  agentId: string;
  claimedAt: number;
  estimatedRelease: number;
  priority: number;
}

interface ServerAgent {
  id: string;
  worktreePath?: string;
  taskDescription: string;
  status: string;
  connectedAt?: number;
  lastHeartbeat?: number;
  claims: ServerClaim[];
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapAgent(a: ServerAgent): AgentRecord {
  const avgPriority =
    a.claims.length > 0
      ? a.claims.reduce((s, c) => s + c.priority, 0) / a.claims.length
      : 0;
  return {
    id: a.id,
    shortId: toShortId(a.id),
    worktreePath: a.worktreePath ?? '—',
    taskDescription: a.taskDescription,
    status: a.status as AgentRecord['status'],
    connectedAt: a.connectedAt ?? Date.now(),
    lastHeartbeat: a.lastHeartbeat ?? Date.now(),
    claimCount: a.claims.length,
    priorityScore: avgPriority,
  };
}

function mapClaim(c: ServerClaim): SymbolClaim {
  return {
    key: c.key,
    filePath: c.filePath,
    symbolName: c.symbolName,
    symbolKind: (c.symbolKind ?? 'function') as SymbolClaim['symbolKind'],
    intent: c.intent as SymbolClaim['intent'],
    agentId: c.agentId,
    agentShortId: toShortId(c.agentId),
    claimedAt: c.claimedAt,
    estimatedRelease: c.estimatedRelease,
    priority: c.priority,
  };
}

// ─── State helpers ────────────────────────────────────────────────────────────

function emptyLiveState(): DashboardState {
  const seed = buildInitialState();
  return {
    agents: [],
    claims: [],
    negotiations: [],
    diffs: [],
    log: [],
    edges: [],
    impactGraph: seed.impactGraph,
    auditEvents: seed.auditEvents,
    policyRules: seed.policyRules,
    approvals: seed.approvals,
    claimLatencySamples: [],
    throughputPerMinute: 0,
    tick: 0,
  };
}

function appendLog(
  log: LogEvent[],
  entry: Omit<LogEvent, 'id' | 'timestamp'>,
): LogEvent[] {
  return [...log, { id: lid(), timestamp: Date.now(), ...entry }].slice(-MAX_LOG);
}

function isDashboard(taskDescription: string): boolean {
  return taskDescription.includes('[SWAP Dashboard Observer]');
}

// ─── Message reducer ──────────────────────────────────────────────────────────

function handleMessage(
  state: DashboardState,
  msg: { type: string; payload: unknown },
): DashboardState {
  const p = msg.payload as Record<string, unknown>;

  switch (msg.type) {
    case 'AGENT_LIST': {
      const serverAgents = (p.agents as ServerAgent[]).filter(
        (a) => !isDashboard(a.taskDescription),
      );
      return {
        ...state,
        tick: state.tick + 1,
        agents: serverAgents.map(mapAgent),
        claims: serverAgents.flatMap((a) => a.claims.map(mapClaim)),
      };
    }

    case 'AGENT_JOINED': {
      const { agentId, taskDescription, worktreePath } = p as {
        agentId: string;
        taskDescription: string;
        worktreePath: string;
      };
      if (isDashboard(taskDescription)) return state;
      const sId = toShortId(agentId);
      const newAgent: AgentRecord = {
        id: agentId,
        shortId: sId,
        worktreePath: worktreePath ?? '—',
        taskDescription,
        status: 'active',
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        claimCount: 0,
        priorityScore: 0,
      };
      return {
        ...state,
        agents: [...state.agents.filter((a) => a.id !== agentId), newAgent],
        log: appendLog(state.log, {
          type: 'AGENT_JOIN',
          agentShortId: sId,
          message: `agent ${sId} connected — "${taskDescription}"`,
        }),
      };
    }

    case 'AGENT_LEFT': {
      const { agentId } = p as { agentId: string };
      const sId = toShortId(agentId);
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === agentId ? { ...a, status: 'disconnected' as const } : a,
        ),
        claims: state.claims.filter((c) => c.agentId !== agentId),
        log: appendLog(state.log, {
          type: 'AGENT_LEAVE',
          agentShortId: sId,
          message: `agent ${sId} disconnected`,
        }),
      };
    }

    case 'CLAIMS_RELEASED': {
      const { agentId, released } = p as {
        agentId: string;
        released: { filePath: string; symbolName: string }[];
      };
      const sId = toShortId(agentId);
      const releasedKeys = new Set(released.map((r) => `${r.filePath}::${r.symbolName}`));
      return {
        ...state,
        claims: state.claims.filter((c) => !releasedKeys.has(c.key)),
        log: appendLog(state.log, {
          type: 'RELEASE',
          agentShortId: sId,
          message: `${sId} disconnected — released ${released.length} claim(s)`,
        }),
      };
    }

    case 'PEER_DIFF': {
      const diff = p as {
        id: string;
        fromAgentId: string;
        filePath: string;
        releasedAt: number;
        changes: {
          symbolName: string;
          symbolKind?: string;
          changeType: string;
          breakingChange: boolean;
          summary?: string;
        }[];
        stats: { added: number; deleted: number; modified: number; breaking: number };
      };
      const sId = toShortId(diff.fromAgentId);
      const dashDiff: SemanticDiff = {
        id: diff.id,
        agentId: diff.fromAgentId,
        agentShortId: sId,
        filePath: diff.filePath,
        releasedAt: diff.releasedAt,
        changes: diff.changes.map((c) => ({
          symbolName: c.symbolName,
          symbolKind: (c.symbolKind ?? 'function') as SymbolClaim['symbolKind'],
          changeType: c.changeType as SemanticDiff['changes'][0]['changeType'],
          breakingChange: c.breakingChange,
          summary: c.summary ?? '',
        })),
        stats: diff.stats,
      };
      const b = diff.stats.breaking;
      return {
        ...state,
        diffs: [dashDiff, ...state.diffs].slice(0, MAX_DIFFS),
        log: appendLog(state.log, {
          type: 'DIFF',
          agentShortId: sId,
          message: `semantic diff: ${diff.filePath} — ${b} breaking change${b !== 1 ? 's' : ''}`,
        }),
      };
    }

    case 'PEER_INTENT': {
      const { agentId, description, filePaths } = p as {
        agentId: string;
        description: string;
        filePaths: string[];
      };
      const sId = toShortId(agentId);
      return {
        ...state,
        log: appendLog(state.log, {
          type: 'CLAIM',
          agentShortId: sId,
          message: `${sId} intent: ${description} [${filePaths?.join(', ') ?? ''}]`,
        }),
      };
    }

    default:
      return state;
  }
}

// ─── Wire message builder ─────────────────────────────────────────────────────

function buildMsg(type: string, payload: unknown = {}): string {
  return JSON.stringify({ id: crypto.randomUUID(), type, timestamp: Date.now(), payload });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSwapSocket(mode: 'live' | 'mock'): {
  state: DashboardState;
  connectionStatus: ConnectionStatus;
} {
  const [state, setState] = useState<DashboardState>(() =>
    mode === 'live' ? emptyLiveState() : buildInitialState(),
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    mode === 'live' ? 'connecting' : 'offline',
  );

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryDelay = useRef(1000);
  const mountedRef = useRef(true);

  const sendListAgents = useCallback(() => {
    wsRef.current?.send(buildMsg('LIST_AGENTS'));
  }, []);

  // ── Mock tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'mock') return;
    const id = setInterval(() => setState((prev) => mockTick(prev)), 2000);
    return () => clearInterval(id);
  }, [mode]);

  // ── Live WebSocket ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const ws = new WebSocket(SWAP_URL);
      wsRef.current = ws;
      setConnectionStatus('connecting');

      ws.onopen = () => {
        retryDelay.current = 1000;
        ws.send(
          buildMsg('REGISTER', {
            worktreePath: '/dashboard',
            taskDescription: '[SWAP Dashboard Observer]',
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: { type: string; payload: unknown };
        try {
          msg = JSON.parse(event.data as string) as typeof msg;
        } catch {
          return;
        }

        if (msg.type === 'REGISTERED') {
          setConnectionStatus('live');
          // Fetch initial agent roster immediately after registration
          ws.send(buildMsg('LIST_AGENTS'));
          setState((prev) =>
            ({
              ...prev,
              log: appendLog(prev.log, {
                type: 'AGENT_JOIN',
                message: 'dashboard observer registered with SWAP server',
              }),
            }),
          );
          return;
        }

        setState((prev) => handleMessage(prev, msg));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('reconnecting');
        retryTimer.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_DELAY_MS);
          connect();
        }, retryDelay.current);
      };

      ws.onerror = () => {
        // onclose fires after onerror — let that handle retry
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [mode]);

  // ── Poll LIST_AGENTS for fresh claim state while connected ─────────────────
  useEffect(() => {
    if (connectionStatus !== 'live') return;
    pollTimer.current = setInterval(sendListAgents, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [connectionStatus, sendListAgents]);

  return { state, connectionStatus };
}
