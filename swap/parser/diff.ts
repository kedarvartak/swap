import { extractSymbols } from './symbol-extractor.js';
import type { FileSnapshot, Symbol as CodeSymbol, SymbolChange, SemanticDiff } from '../shared/types.js';
import { v4 as uuid } from 'uuid';

export class SnapshotStore {
  private snapshots = new Map<string, FileSnapshot>(); // filePath → latest snapshot

  take(filePath: string, source: string): FileSnapshot {
    const symbols = extractSymbols(source, filePath);
    const snapshot: FileSnapshot = {
      filePath,
      takenAt: Date.now(),
      symbols,
      fullSource: source,
    };
    this.snapshots.set(filePath, snapshot);
    return snapshot;
  }

  get(filePath: string): FileSnapshot | undefined {
    return this.snapshots.get(filePath);
  }

  // Diffs current source against stored snapshot and returns a SemanticDiff.
  // Stores the new snapshot after diffing.
  diff(filePath: string, newSource: string, fromAgentId: string): SemanticDiff {
    const before = this.snapshots.get(filePath);
    const afterSnapshot = this.take(filePath, newSource); // stores new snapshot

    const beforeSymbols = before?.symbols ?? [];
    const afterSymbols = afterSnapshot.symbols;

    const changes = diffSymbols(beforeSymbols, afterSymbols);

    return {
      id: uuid(),
      fromAgentId,
      filePath,
      releasedAt: Date.now(),
      changes,
      stats: {
        added: changes.filter((c) => c.changeType === 'ADDED').length,
        deleted: changes.filter((c) => c.changeType === 'DELETED').length,
        modified: changes.filter((c) => ['SIGNATURE_CHANGED', 'BODY_CHANGED', 'RENAMED'].includes(c.changeType)).length,
        breaking: changes.filter((c) => c.breakingChange).length,
      },
    };
  }
}

function diffSymbols(before: CodeSymbol[], after: CodeSymbol[]): SymbolChange[] {
  const changes: SymbolChange[] = [];
  const beforeMap = new Map(before.map((s) => [s.name, s]));
  const afterMap = new Map(after.map((s) => [s.name, s]));

  // Deleted
  for (const [name, sym] of beforeMap) {
    if (!afterMap.has(name)) {
      changes.push({
        symbolName: name,
        symbolKind: sym.kind,
        changeType: 'DELETED',
        summary: `${sym.kind} \`${name}\` was removed`,
        breakingChange: sym.exported,
        affectedSymbols: [],
      });
    }
  }

  // Added
  for (const [name, sym] of afterMap) {
    if (!beforeMap.has(name)) {
      changes.push({
        symbolName: name,
        symbolKind: sym.kind,
        changeType: 'ADDED',
        summary: `${sym.kind} \`${name}\` was added`,
        breakingChange: false,
        affectedSymbols: [],
      });
    }
  }

  // Modified
  for (const [name, beforeSym] of beforeMap) {
    const afterSym = afterMap.get(name);
    if (!afterSym) continue;

    if (beforeSym.signature !== afterSym.signature && beforeSym.signature && afterSym.signature) {
      changes.push({
        symbolName: name,
        symbolKind: afterSym.kind,
        changeType: 'SIGNATURE_CHANGED',
        before: parseSignature(beforeSym.signature),
        after: parseSignature(afterSym.signature),
        summary: `${afterSym.kind} \`${name}\` signature changed: ${beforeSym.signature} → ${afterSym.signature}`,
        breakingChange: true,
        affectedSymbols: [],
      });
    } else if (beforeSym.startByte !== afterSym.startByte || beforeSym.endByte !== afterSym.endByte) {
      changes.push({
        symbolName: name,
        symbolKind: afterSym.kind,
        changeType: 'BODY_CHANGED',
        summary: `${afterSym.kind} \`${name}\` implementation changed (interface unchanged)`,
        breakingChange: false,
        affectedSymbols: [],
      });
    }
  }

  return changes;
}

function parseSignature(sig: string) {
  return {
    params: [],
    returnType: sig,
    async: sig.includes('async'),
  };
}
