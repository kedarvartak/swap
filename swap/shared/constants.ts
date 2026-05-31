export const SERVER_PORT = 7700;
export const DEFAULT_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
// Hook clients prefer the Unix domain socket for local, low-latency claim checks.
// If it is unavailable they fall back to DEFAULT_SERVER_URL.
export const DEFAULT_SERVER_SOCKET_PATH = '/tmp/swap-server.sock';
export const DEFAULT_SERVER_SOCKET_URL = `ws+unix://${DEFAULT_SERVER_SOCKET_PATH}`;
export const HOOK_CLAIM_TIMEOUT_MS = 100;
export type CoordinationMode = 'strict' | 'advisory';
export const COORDINATION_MODE: CoordinationMode = 'advisory';
export interface CoordinationPolicy {
  defaultMode: CoordinationMode;
  pathOverrides: { pattern: string; mode: CoordinationMode }[];
}
export const COORDINATION_POLICY: CoordinationPolicy = {
  defaultMode: COORDINATION_MODE,
  pathOverrides: [],
};
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 30_000;
export const REGISTRATION_TIMEOUT_MS = 5_000;
export const CLAIM_TTL_MS = 30 * 60 * 1000;       // 30 minutes
export const NEGOTIATION_TIMEOUT_MS = 10_000;
export const RECONNECT_CLAIM_EXPIRY_MS = 60_000;
export const MAX_RECENT_DIFFS = 10;
export const MAX_EVENT_BUFFER = 50;
export const DEPENDENCY_GRAPH_MAX_DEPTH = 4;
export const PRIORITY_TIE_THRESHOLD = 0.05;
