import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { decode, encode, type Message } from '../shared/protocol.js';
import type { ClaimPayload, ReleasePayload } from '../shared/protocol.js';
import {
  DEFAULT_SERVER_SOCKET_PATH,
  DEFAULT_SERVER_URL,
  HOOK_CLAIM_TIMEOUT_MS,
} from '../shared/constants.js';
import type { HookEvent } from './resolve.js';

export interface HookClientConfig {
  url: string;
  worktreePath: string;
  agentId: string;
  taskDescription: string;
}

export function resolveHookConfig(event: HookEvent): HookClientConfig {
  const worktreePath = process.env.SWAP_WORKTREE_PATH ?? event.cwd ?? process.cwd();
  const sessionId = process.env.SWAP_AGENT_ID ?? event.agent_id ?? event.session_id ?? 'unknown-session';
  const agentId = process.env.SWAP_AGENT_ID ?? `hook-${hash(`${worktreePath}:${sessionId}`)}`;
  return {
    url: process.env.SWAP_SERVER_URL ?? unixSocketUrl(process.env.SWAP_SERVER_SOCKET_PATH ?? DEFAULT_SERVER_SOCKET_PATH),
    worktreePath,
    agentId,
    taskDescription: process.env.SWAP_AGENT_TASK ?? `Claude Code hook session ${sessionId}`,
  };
}

export async function requestSwap(
  config: HookClientConfig,
  type: 'CLAIM' | 'RELEASE',
  payload: ClaimPayload | ReleasePayload,
  responseTypes: string[],
  timeoutMs = Number(process.env.SWAP_HOOK_TIMEOUT_MS ?? HOOK_CLAIM_TIMEOUT_MS)
): Promise<Message> {
  const startedAt = Date.now();
  try {
    const response = await requestOnce(config, type, payload, responseTypes, timeoutMs);
    recordLatency(startedAt);
    return response;
  } catch (error) {
    if (config.url.startsWith('ws+unix:') && !process.env.SWAP_SERVER_URL) {
      const response = await requestOnce({ ...config, url: DEFAULT_SERVER_URL }, type, payload, responseTypes, timeoutMs);
      recordLatency(startedAt);
      return response;
    }
    throw error;
  }
}

function requestOnce(
  config: HookClientConfig,
  type: 'CLAIM' | 'RELEASE',
  payload: ClaimPayload | ReleasePayload,
  responseTypes: string[],
  timeoutMs: number
): Promise<Message> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(config.url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`SWAP ${type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(encode({
        id: uuid(),
        type: 'REGISTER',
        payload: {
          worktreePath: config.worktreePath,
          taskDescription: config.taskDescription,
          agentId: config.agentId,
          clientKind: 'hook',
        },
      }));
    });

    ws.on('message', (raw) => {
      let msg: Message;
      try {
        msg = decode(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'REGISTERED') {
        ws.send(encode({ id: uuid(), type, payload }));
        return;
      }

      if (responseTypes.includes(msg.type)) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function unixSocketUrl(socketPath: string): string {
  return `ws+unix://${socketPath}:/`;
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function recordLatency(startedAt: number): void {
  const filePath = process.env.SWAP_HOOK_LATENCY_FILE;
  if (!filePath) return;
  try {
    fs.appendFileSync(filePath, `${Date.now() - startedAt}\n`, 'utf8');
  } catch {
    // Metrics are best effort.
  }
}
