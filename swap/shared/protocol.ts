import type { AgentStatus, ClaimIntent, SemanticDiff, SymbolClaim, AgentRecord } from './types.js';

// ─── Message envelope ────────────────────────────────────────────────────────

export interface Message<T = unknown> {
  id: string;
  type: MessageType;
  timestamp: number;
  payload: T;
}

// ─── Message types ───────────────────────────────────────────────────────────

export type MessageType =
  // Client → Server
  | 'REGISTER'
  | 'PING'
  | 'CLAIM'
  | 'RELEASE'
  | 'NEGOTIATE'
  | 'BROADCAST_INTENT'
  | 'STATUS_UPDATE'
  | 'LIST_AGENTS'
  // Server → Client
  | 'REGISTERED'
  | 'PONG'
  | 'AGENT_JOINED'
  | 'AGENT_LEFT'
  | 'AGENT_RECONNECTED'
  | 'AGENT_LIST'
  | 'CLAIM_GRANTED'
  | 'CLAIM_CONFLICT'
  | 'DEPENDENCY_CONFLICT'
  | 'NEGOTIATE_REQUEST'
  | 'DEFER'
  | 'RELEASE_ACK'
  | 'CLAIMS_RELEASED'
  | 'PEER_DIFF'
  | 'PEER_INTENT'
  | 'ERROR';

// ─── Client → Server payloads ────────────────────────────────────────────────

export interface RegisterPayload {
  worktreePath: string;
  taskDescription: string;
  agentId?: string;
  clientKind?: 'mcp' | 'hook';
}

export interface ClaimPayload {
  filePath: string;
  symbolName: string;
  intent: ClaimIntent;
  estimatedMinutes?: number;
  source?: 'mcp' | 'hook';
}

export interface ReleasePayload {
  filePath: string;
  symbolName: string;
  newSource?: string;
  source?: 'mcp' | 'hook';
}

export interface NegotiatePayload {
  priority: number;
  justification: string;
}

export interface BroadcastIntentPayload {
  description: string;
  filePaths: string[];
  estimatedMinutes?: number;
}

export interface StatusUpdatePayload {
  status: AgentStatus;
}

// ─── Server → Client payloads ────────────────────────────────────────────────

export interface RegisteredPayload {
  agentId: string;
}

export interface AgentJoinedPayload {
  agentId: string;
  taskDescription: string;
  worktreePath: string;
}

export interface AgentLeftPayload {
  agentId: string;
}

export interface AgentListPayload {
  agents: Pick<AgentRecord, 'id' | 'taskDescription' | 'status' | 'claims'>[];
  totalActive: number;
}

export interface ClaimGrantedPayload {
  filePath: string;
  symbolName: string;
  claimId: string;
}

export interface ClaimConflictPayload {
  filePath: string;
  symbolName: string;
  heldBy: string;
  heldByTask: string;
  intent: ClaimIntent;
  suggestion?: string;
}

export interface DependencyConflictPayload {
  ownerAgentId: string;
  ownedSymbol: string;
  affectedAgentId: string;
  affectedSymbol: string;
  reason: string;
}

export interface NegotiateRequestPayload {
  symbol: string;
  filePath: string;
  competitorId: string;
  timeoutMs: number;
}

export interface DeferPayload {
  filePath: string;
  symbolName: string;
  deferTo: string;
  suggestion?: string;
}

export interface ClaimsReleasedPayload {
  agentId: string;
  released: { filePath: string; symbolName: string }[];
}

export interface PeerIntentPayload {
  agentId: string;
  description: string;
  filePaths: string[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ─── Encode / decode helpers ─────────────────────────────────────────────────

export function encode(msg: Omit<Message, 'timestamp'>): string {
  return JSON.stringify({ ...msg, timestamp: Date.now() });
}

export function decode(raw: string): Message {
  return JSON.parse(raw) as Message;
}
