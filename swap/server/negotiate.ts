import { v4 as uuid } from 'uuid';
import type { AgentRecord, SymbolClaim, SymbolKey } from '../shared/types.js';
import type { DependencyGraph } from './graph.js';
import { NEGOTIATION_TIMEOUT_MS, PRIORITY_TIE_THRESHOLD } from '../shared/constants.js';

// ── Priority scoring ──────────────────────────────────────────────────────────

const HIGH_CRITICALITY = ['auth', 'authentication', 'payment', 'billing', 'security', 'core', 'critical', 'migration', 'schema', 'production'];
const LOW_CRITICALITY  = ['cleanup', 'style', 'lint', 'rename', 'comment', 'docs', 'typo', 'format', 'minor', 'cosmetic', 'refactor'];

function taskCriticalityScore(task: string): number {
  const lower = task.toLowerCase();
  const high = HIGH_CRITICALITY.filter((t) => lower.includes(t)).length;
  const low  = LOW_CRITICALITY.filter((t) => lower.includes(t)).length;
  return Math.max(0, Math.min(1, 0.5 + high * 0.15 - low * 0.1));
}

function symbolImportanceScore(key: SymbolKey, graph: DependencyGraph): number {
  const max = graph.maxDependentCount();
  if (max === 0) return 0.5;
  return Math.min(1, graph.countTransitiveDependents(key) / max);
}

function progressInvestedScore(agent: AgentRecord): number {
  return Math.min(1, agent.recentDiffs.length / 10);
}

function claimAgeScore(agent: AgentRecord, claim: SymbolClaim): number {
  // Older claims in adjacent symbols = more "established territory"
  const now = Date.now();
  const oldestClaim = agent.claims.reduce(
    (min, c) => Math.min(min, c.claimedAt),
    now
  );
  const ageMs = now - oldestClaim;
  // Saturates at 10 minutes
  return Math.min(1, ageMs / (10 * 60 * 1000));
}

function agentLoadScore(agent: AgentRecord): number {
  // Fewer claims = more capacity = slightly higher priority
  return Math.max(0, 1 - agent.claims.length / 20);
}

export function computePriority(agent: AgentRecord, claim: SymbolClaim, graph: DependencyGraph): number {
  return (
    taskCriticalityScore(agent.taskDescription) * 0.35 +
    symbolImportanceScore(claim.key, graph)      * 0.25 +
    progressInvestedScore(agent)                 * 0.20 +
    claimAgeScore(agent, claim)                  * 0.15 +
    agentLoadScore(agent)                        * 0.05
  );
}

// ── Negotiation session ───────────────────────────────────────────────────────

export interface NegotiateResponse {
  agentId: string;
  priority: number;
  justification: string;
  respondedAt: number;
}

export interface NegotiationResult {
  winner: string;
  loser: string;
  winnerPriority: number;
  loserPriority: number;
  reason: 'priority' | 'tie-break' | 'timeout';
}

type SendFn = (agentId: string, msg: object) => void;
type GetAgentFn = (agentId: string) => AgentRecord | undefined;
type GetClaimsForSymbolFn = (filePath: string, symbolName: string) => SymbolClaim[];

export class NegotiationSession {
  private responses = new Map<string, NegotiateResponse>();
  private resolvers: ((result: NegotiationResult) => void)[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly filePath: string,
    private readonly symbolName: string,
    private readonly agentA: AgentRecord,
    private readonly agentB: AgentRecord,
    private readonly claimA: SymbolClaim,
    private readonly claimB: SymbolClaim,
    private readonly graph: DependencyGraph,
    private readonly send: SendFn
  ) {}

  start(): Promise<NegotiationResult> {
    const payload = {
      sessionId: this.sessionId,
      filePath: this.filePath,
      symbolName: this.symbolName,
      competitorId: '',
      timeoutMs: NEGOTIATION_TIMEOUT_MS,
    };

    this.send(this.agentA.id, { id: uuid(), type: 'NEGOTIATE_REQUEST', payload: { ...payload, competitorId: this.agentB.id } });
    this.send(this.agentB.id, { id: uuid(), type: 'NEGOTIATE_REQUEST', payload: { ...payload, competitorId: this.agentA.id } });

    return new Promise((resolve) => {
      this.resolvers.push(resolve);

      this.timer = setTimeout(() => {
        // Timeout — whoever responded wins; if neither, use priority
        this.arbitrate('timeout', resolve);
      }, NEGOTIATION_TIMEOUT_MS);
    });
  }

  receiveResponse(agentId: string, priority: number, justification: string): void {
    this.responses.set(agentId, { agentId, priority, justification, respondedAt: Date.now() });

    if (this.responses.size === 2) {
      if (this.timer) clearTimeout(this.timer);
      this.arbitrate('priority', this.resolvers[0]);
    }
  }

  private arbitrate(reason: 'priority' | 'timeout', resolve: (r: NegotiationResult) => void): void {
    const responseA = this.responses.get(this.agentA.id);
    const responseB = this.responses.get(this.agentB.id);

    let priorityA: number;
    let priorityB: number;

    if (reason === 'timeout') {
      // Responded agent gets a boost; silent agent gets penalized
      priorityA = responseA ? responseA.priority : computePriority(this.agentA, this.claimA, this.graph) * 0.5;
      priorityB = responseB ? responseB.priority : computePriority(this.agentB, this.claimB, this.graph) * 0.5;
    } else {
      priorityA = responseA?.priority ?? computePriority(this.agentA, this.claimA, this.graph);
      priorityB = responseB?.priority ?? computePriority(this.agentB, this.claimB, this.graph);
    }

    let winner: string;
    let loser: string;
    let finalReason: NegotiationResult['reason'] = reason === 'timeout' ? 'timeout' : 'priority';

    if (Math.abs(priorityA - priorityB) <= PRIORITY_TIE_THRESHOLD) {
      // Tie-break: earlier claim time wins
      winner = this.claimA.claimedAt <= this.claimB.claimedAt ? this.agentA.id : this.agentB.id;
      loser  = winner === this.agentA.id ? this.agentB.id : this.agentA.id;
      finalReason = 'tie-break';
    } else {
      winner = priorityA >= priorityB ? this.agentA.id : this.agentB.id;
      loser  = winner === this.agentA.id ? this.agentB.id : this.agentA.id;
    }

    resolve({
      winner,
      loser,
      winnerPriority: winner === this.agentA.id ? priorityA : priorityB,
      loserPriority:  loser  === this.agentA.id ? priorityA : priorityB,
      reason: finalReason,
    });
  }
}

// ── Negotiation manager ───────────────────────────────────────────────────────

export class NegotiationManager {
  // sessionId → session
  private sessions = new Map<string, NegotiationSession>();
  // symbol key → sessionId (to deduplicate concurrent conflicts on same symbol)
  private symbolSessions = new Map<SymbolKey, string>();

  async negotiate(
    filePath: string,
    symbolName: string,
    agentA: AgentRecord,
    agentB: AgentRecord,
    claimA: SymbolClaim,
    claimB: SymbolClaim,
    graph: DependencyGraph,
    send: SendFn
  ): Promise<NegotiationResult> {
    const key = `${filePath}::${symbolName}`;

    // Prevent double-negotiation on same symbol
    if (this.symbolSessions.has(key)) {
      // Return a synthetic result deferring agentB (the later claimer)
      return {
        winner: agentA.id,
        loser: agentB.id,
        winnerPriority: 1,
        loserPriority: 0,
        reason: 'tie-break',
      };
    }

    const sessionId = uuid();
    const session = new NegotiationSession(
      sessionId, filePath, symbolName, agentA, agentB, claimA, claimB, graph, send
    );

    this.sessions.set(sessionId, session);
    this.symbolSessions.set(key, sessionId);

    try {
      const result = await session.start();
      return result;
    } finally {
      this.sessions.delete(sessionId);
      this.symbolSessions.delete(key);
    }
  }

  receiveNegotiateResponse(sessionId: string, agentId: string, priority: number, justification: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.receiveResponse(agentId, priority, justification);
    return true;
  }

  getSessionIdForSymbol(filePath: string, symbolName: string): string | undefined {
    return this.symbolSessions.get(`${filePath}::${symbolName}`);
  }
}
