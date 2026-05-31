import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HookEvent, ResolvedSymbol } from './resolve.js';

const STATE_DIR = path.join(os.tmpdir(), 'swap-hooks');

export function saveHookClaims(event: HookEvent, symbols: ResolvedSymbol[]): void {
  if (symbols.length === 0) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(statePath(event), JSON.stringify({ symbols }, null, 2), 'utf8');
}

export function loadHookClaims(event: HookEvent): ResolvedSymbol[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(event), 'utf8')) as { symbols?: ResolvedSymbol[] };
    return Array.isArray(parsed.symbols) ? parsed.symbols : [];
  } catch {
    return [];
  }
}

export function clearHookClaims(event: HookEvent): void {
  try {
    fs.unlinkSync(statePath(event));
  } catch {
    // Already gone.
  }
}

function statePath(event: HookEvent): string {
  return path.join(STATE_DIR, `${stateKey(event)}.json`);
}

function stateKey(event: HookEvent): string {
  const input = JSON.stringify({
    session_id: event.session_id,
    cwd: event.cwd,
    tool_name: event.tool_name,
    tool_input: event.tool_input,
  });
  return crypto.createHash('sha256').update(input).digest('hex');
}
