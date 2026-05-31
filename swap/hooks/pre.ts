import { COORDINATION_POLICY, type CoordinationMode } from '../shared/constants.js';
import type { ClaimConflictPayload } from '../shared/protocol.js';
import { requestSwap, resolveHookConfig } from './client.js';
import { resolveTouchedSymbols, type HookEvent, type ResolvedSymbol } from './resolve.js';
import { saveHookClaims } from './state.js';

export async function runPreHook(event: HookEvent): Promise<void> {
  const symbols = resolveTouchedSymbols(event, 'pre');
  if (symbols.length === 0) return allow();

  const config = resolveHookConfig(event);
  const granted: ResolvedSymbol[] = [];
  const conflicts: ClaimConflictPayload[] = [];
  const startedAt = Date.now();

  try {
    for (const symbol of symbols) {
      const response = await requestSwap(config, 'CLAIM', {
        filePath: symbol.filePath,
        symbolName: symbol.symbolName,
        intent: 'write',
        estimatedMinutes: 30,
        source: 'hook',
      }, ['CLAIM_GRANTED', 'CLAIM_CONFLICT']);

      if (response.type === 'CLAIM_GRANTED') granted.push(symbol);
      if (response.type === 'CLAIM_CONFLICT') conflicts.push(response.payload as ClaimConflictPayload);
    }
  } catch (error) {
    return allow(`SWAP hook warning: coordination server unreachable; allowing edit. ${messageFor(error)}`);
  }

  if (granted.length > 0) saveHookClaims(event, granted);
  if (conflicts.length === 0) return allow();

  const mode = resolveMode(symbols);
  const reason = conflictReason(conflicts, Date.now() - startedAt, mode);
  if (mode === 'strict') {
    await releaseGranted(config, granted);
  }
  return mode === 'strict' ? deny(reason) : allow(reason);
}

function resolveMode(_symbols: ResolvedSymbol[]): CoordinationMode {
  const envMode = process.env.SWAP_COORDINATION_MODE;
  if (envMode === 'strict' || envMode === 'advisory') return envMode;
  for (const symbol of _symbols) {
    const override = COORDINATION_POLICY.pathOverrides.find((entry) => matchesPath(entry.pattern, symbol.filePath));
    if (override) return override.mode;
  }
  return COORDINATION_POLICY.defaultMode;
}

function allow(reason?: string): void {
  const output: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
  if (reason) {
    (output.hookSpecificOutput as Record<string, unknown>).permissionDecisionReason = reason;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function deny(reason: string): void {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`);
}

function conflictReason(conflicts: ClaimConflictPayload[], latencyMs: number, mode: CoordinationMode): string {
  const details = conflicts.map((conflict) => {
    const suggestion = conflict.suggestion ? ` Suggestion: ${conflict.suggestion}.` : '';
    return `${conflict.filePath}::${conflict.symbolName} is held by ${conflict.heldByTask} (${conflict.intent}).${suggestion}`;
  }).join(' ');
  return `SWAP ${mode} coordination conflict after ${latencyMs}ms: ${details}`;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function releaseGranted(config: ReturnType<typeof resolveHookConfig>, symbols: ResolvedSymbol[]): Promise<void> {
  for (const symbol of symbols) {
    try {
      await requestSwap(config, 'RELEASE', {
        filePath: symbol.filePath,
        symbolName: symbol.symbolName,
        source: 'hook',
      }, ['RELEASE_ACK']);
    } catch {
      // Best effort cleanup; claim TTL is the fallback.
    }
  }
}

function matchesPath(pattern: string, filePath: string): boolean {
  if (pattern.endsWith('/**')) return filePath.startsWith(pattern.slice(0, -3));
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes('/');
  }
  if (pattern.endsWith('*')) return filePath.startsWith(pattern.slice(0, -1));
  return filePath === pattern;
}
