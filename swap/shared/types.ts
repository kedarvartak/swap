export type AgentStatus = 'idle' | 'active' | 'waiting' | 'done' | 'disconnected';
export type ClaimIntent = 'read' | 'write' | 'refactor' | 'delete';
export type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant';
export type ChangeType = 'ADDED' | 'DELETED' | 'SIGNATURE_CHANGED' | 'BODY_CHANGED' | 'RENAMED' | 'MOVED';
export type EdgeKind = 'call' | 'extend' | 'implement' | 'import' | 'type-use';

export type SymbolKey = string; // `${filePath}::${symbolName}`

export interface Symbol {
  name: string;
  kind: SymbolKind;
  exported: boolean;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  signature?: string;
  dependencies: string[];
}

export interface SymbolSignature {
  params: { name: string; type: string; optional: boolean }[];
  returnType: string;
  typeParams?: string[];
  async: boolean;
}

export interface SymbolClaim {
  key: SymbolKey;
  filePath: string;
  symbolName: string;
  symbolKind?: SymbolKind;
  intent: ClaimIntent;
  agentId: string;
  claimedAt: number;
  estimatedRelease: number;
  priority: number;
}

export interface SymbolChange {
  symbolName: string;
  symbolKind: string;
  changeType: ChangeType;
  before?: SymbolSignature;
  after?: SymbolSignature;
  summary: string;
  breakingChange: boolean;
  affectedSymbols: string[];
}

export interface SemanticDiff {
  id: string;
  fromAgentId: string;
  filePath: string;
  releasedAt: number;
  changes: SymbolChange[];
  stats: {
    added: number;
    deleted: number;
    modified: number;
    breaking: number;
  };
}

export interface FileSnapshot {
  filePath: string;
  takenAt: number;
  symbols: Symbol[];
  fullSource: string;
}

export interface AgentRecord {
  id: string;
  worktreePath: string;
  taskDescription: string;
  status: AgentStatus;
  connectedAt: number;
  lastHeartbeat: number;
  claims: SymbolClaim[];
  recentDiffs: SemanticDiff[];
}

export interface DependencyEdge {
  from: SymbolKey;
  to: SymbolKey;
  kind: EdgeKind;
}
