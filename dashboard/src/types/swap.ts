export type AgentStatus = 'idle' | 'active' | 'waiting' | 'done' | 'disconnected';
export type ClaimIntent = 'read' | 'write' | 'refactor' | 'delete';
export type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant';
export type ChangeType = 'ADDED' | 'DELETED' | 'SIGNATURE_CHANGED' | 'BODY_CHANGED' | 'RENAMED' | 'MOVED';
export type EdgeKind = 'call' | 'extend' | 'implement' | 'import' | 'type-use';
export type NegotiationReason = 'priority' | 'tie-break' | 'timeout';

export type SymbolKey = string; // `${filePath}::${symbolName}`

export interface AgentRecord {
  id: string;
  shortId: string;
  worktreePath: string;
  taskDescription: string;
  status: AgentStatus;
  connectedAt: number;
  lastHeartbeat: number;
  claimCount: number;
  priorityScore: number;
}

export interface SymbolClaim {
  key: SymbolKey;
  filePath: string;
  symbolName: string;
  symbolKind: SymbolKind;
  intent: ClaimIntent;
  agentId: string;
  agentShortId: string;
  claimedAt: number;
  estimatedRelease: number;
  priority: number;
}

export interface NegotiationRecord {
  sessionId: string;
  filePath: string;
  symbolName: string;
  agentA: string;
  agentB: string;
  winner: string | null;
  loser: string | null;
  priorityA: number;
  priorityB: number;
  reason: NegotiationReason | null;
  startedAt: number;
  resolvedAt: number | null;
  active: boolean;
}

export interface SymbolChange {
  symbolName: string;
  symbolKind: SymbolKind;
  changeType: ChangeType;
  breakingChange: boolean;
  summary: string;
}

export interface SemanticDiff {
  id: string;
  agentId: string;
  agentShortId: string;
  filePath: string;
  releasedAt: number;
  changes: SymbolChange[];
  stats: { added: number; deleted: number; modified: number; breaking: number };
}

export type LogEventType =
  | 'AGENT_JOIN'
  | 'AGENT_LEAVE'
  | 'CLAIM'
  | 'RELEASE'
  | 'CONFLICT'
  | 'RESOLVE'
  | 'DIFF'
  | 'HEARTBEAT'
  | 'NEGOTIATE';

export interface LogEvent {
  id: string;
  timestamp: number;
  type: LogEventType;
  agentShortId?: string;
  message: string;
}

export interface DependencyEdge {
  from: SymbolKey;
  to: SymbolKey;
  kind: EdgeKind;
}

export interface DashboardState {
  agents: AgentRecord[];
  claims: SymbolClaim[];
  negotiations: NegotiationRecord[];
  diffs: SemanticDiff[];
  log: LogEvent[];
  edges: DependencyEdge[];
  tick: number;
}
