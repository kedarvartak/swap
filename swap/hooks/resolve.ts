import fs from 'node:fs';
import path from 'node:path';
import { extractFull } from '../parser/symbol-extractor.js';
import type { Symbol as CodeSymbol } from '../shared/types.js';

export interface ResolvedSymbol {
  filePath: string;
  symbolName: string;
}

export interface HookEvent {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  agent_id?: string;
  agent_type?: string;
}

export function resolveTouchedSymbols(event: HookEvent, mode: 'pre' | 'post'): ResolvedSymbol[] {
  const tool = event.tool_name;
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) return [];

  const cwd = event.cwd || process.cwd();
  const filePath = normalizeToolPath(event.tool_input.file_path, cwd);
  if (!filePath) return [];

  const absolutePath = path.resolve(cwd, filePath);
  const source = readIfExists(absolutePath);

  if (tool === 'Write') {
    if (mode === 'pre' && source === null) return [];
    const content = typeof event.tool_input.content === 'string' ? event.tool_input.content : '';
    return source === null
      ? []
      : mapChangedRanges(filePath, source, content);
  }

  const searchStrings =
    tool === 'Edit'
      ? [mode === 'post' ? event.tool_input.new_string : event.tool_input.old_string]
      : readMultiEditNeedles(event.tool_input.edits, mode);

  if (source === null) return [];
  return mapNeedlesToSymbols(filePath, source, searchStrings);
}

function normalizeToolPath(value: unknown, cwd: string): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return path.isAbsolute(value) ? path.relative(cwd, value) : value;
}

function readIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readMultiEditNeedles(value: unknown, mode: 'pre' | 'post'): string[] {
  if (!Array.isArray(value)) return [];
  const key = mode === 'post' ? 'new_string' : 'old_string';
  return value
    .map((edit) => edit && typeof edit === 'object' ? (edit as Record<string, unknown>)[key] : undefined)
    .filter((needle): needle is string => typeof needle === 'string' && needle.length > 0);
}

function mapNeedlesToSymbols(filePath: string, source: string, needles: unknown[]): ResolvedSymbol[] {
  const symbols = extractFull(source, filePath).symbols;
  if (symbols.length === 0) return [{ filePath, symbolName: '<file>' }];

  const resolved: ResolvedSymbol[] = [];
  for (const needle of needles) {
    if (typeof needle !== 'string' || needle.length === 0) continue;
    let offset = 0;
    let foundAny = false;
    while (offset <= source.length) {
      const start = source.indexOf(needle, offset);
      if (start === -1) break;
      const startByte = byteOffset(source, start);
      const end = startByte + Buffer.byteLength(needle, 'utf8');
      resolved.push(...symbolsForRange(filePath, symbols, startByte, end));
      foundAny = true;
      offset = start + Math.max(needle.length, 1);
    }
    if (!foundAny) resolved.push({ filePath, symbolName: '<file>' });
  }

  return dedupe(resolved.length > 0 ? resolved : [{ filePath, symbolName: '<file>' }]);
}

function mapChangedRanges(filePath: string, before: string, after: string): ResolvedSymbol[] {
  const symbols = extractFull(before, filePath).symbols;
  if (symbols.length === 0) return [{ filePath, symbolName: '<file>' }];
  if (before === after) return [];

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }

  return dedupe(symbolsForRange(filePath, symbols, byteOffset(before, start), byteOffset(before, beforeEnd)));
}

function symbolsForRange(filePath: string, symbols: CodeSymbol[], start: number, end: number): ResolvedSymbol[] {
  const touched = symbols.filter((sym) => rangesOverlap(start, end, sym.startByte, sym.endByte));
  if (touched.length === 0) return [{ filePath, symbolName: '<file>' }];
  return touched.map((sym) => ({ filePath, symbolName: sym.name }));
}

function rangesOverlap(start: number, end: number, symStart: number, symEnd: number): boolean {
  if (start === end) return symStart <= start && start <= symEnd;
  return start < symEnd && end > symStart;
}

function dedupe(symbols: ResolvedSymbol[]): ResolvedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.filePath}::${symbol.symbolName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byteOffset(source: string, charOffset: number): number {
  return Buffer.byteLength(source.slice(0, charOffset), 'utf8');
}
