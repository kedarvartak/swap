import fs from 'node:fs';
import path from 'node:path';
import { requestSwap, resolveHookConfig } from './client.js';
import { resolveTouchedSymbols, type HookEvent, type ResolvedSymbol } from './resolve.js';
import { clearHookClaims, loadHookClaims } from './state.js';

export async function runPostHook(event: HookEvent): Promise<void> {
  const claimed = loadHookClaims(event);
  const symbols = claimed.length > 0 ? claimed : resolveTouchedSymbols(event, 'post');
  if (symbols.length === 0) return;

  const config = resolveHookConfig(event);
  const failed = toolFailed(event);

  for (const symbol of symbols) {
    try {
      await requestSwap(config, 'RELEASE', {
        filePath: symbol.filePath,
        symbolName: symbol.symbolName,
        newSource: failed ? undefined : readCurrentSource(config.worktreePath, symbol),
        source: 'hook',
      }, ['RELEASE_ACK']);
    } catch (error) {
      console.error(`SWAP hook warning: release failed for ${symbol.filePath}::${symbol.symbolName}: ${messageFor(error)}`);
    }
  }

  clearHookClaims(event);
}

function readCurrentSource(worktreePath: string, symbol: ResolvedSymbol): string | undefined {
  try {
    return fs.readFileSync(path.resolve(worktreePath, symbol.filePath), 'utf8');
  } catch {
    return undefined;
  }
}

function toolFailed(event: HookEvent): boolean {
  const response = event.tool_response;
  if (!response) return false;
  return Boolean(response.error || response.interrupted || response.is_error);
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
