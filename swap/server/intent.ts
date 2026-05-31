import { v4 as uuid } from 'uuid';
import type { SymbolClaim, SymbolKey, ClaimIntent } from '../shared/types.js';
import { CLAIM_TTL_MS } from '../shared/constants.js';

export type ClaimResult =
  | { granted: true; claim: SymbolClaim }
  | { granted: false; conflict: ConflictInfo };

export interface ConflictInfo {
  heldBy: string;
  heldByTask: string;
  intent: ClaimIntent;
  claimedAt: number;
}

// Write-type intents are exclusive; read is shared
const EXCLUSIVE_INTENTS: ClaimIntent[] = ['write', 'refactor', 'delete'];

function isExclusive(intent: ClaimIntent): boolean {
  return EXCLUSIVE_INTENTS.includes(intent);
}

function symbolKey(filePath: string, symbolName: string): SymbolKey {
  return `${filePath}::${symbolName}`;
}

export class IntentRegistry {
  // key → list of active claims (multiple read claims allowed)
  private claims = new Map<SymbolKey, SymbolClaim[]>();
  // agentId → set of keys that agent holds
  private agentKeys = new Map<string, Set<SymbolKey>>();

  private agentTaskMap = new Map<string, string>(); // agentId → taskDescription

  registerAgent(agentId: string, taskDescription: string) {
    this.agentTaskMap.set(agentId, taskDescription);
    if (!this.agentKeys.has(agentId)) {
      this.agentKeys.set(agentId, new Set());
    }
  }

  unregisterAgent(agentId: string) {
    this.agentTaskMap.delete(agentId);
    this.agentKeys.delete(agentId);
  }

  claim(
    agentId: string,
    filePath: string,
    symbolName: string,
    intent: ClaimIntent,
    estimatedMinutes = 30
  ): ClaimResult {
    const key = symbolKey(filePath, symbolName);
    const existing = this.claims.get(key) ?? [];

    // Check for conflicts
    for (const c of existing) {
      if (c.agentId === agentId) continue; // same agent re-claiming is ok
      // Any exclusive claim by another agent blocks everything
      if (isExclusive(c.intent)) {
        return {
          granted: false,
          conflict: {
            heldBy: c.agentId,
            heldByTask: this.agentTaskMap.get(c.agentId) ?? 'unknown',
            intent: c.intent,
            claimedAt: c.claimedAt,
          },
        };
      }
      // Read claim exists + new intent is exclusive → conflict
      if (isExclusive(intent)) {
        return {
          granted: false,
          conflict: {
            heldBy: c.agentId,
            heldByTask: this.agentTaskMap.get(c.agentId) ?? 'unknown',
            intent: c.intent,
            claimedAt: c.claimedAt,
          },
        };
      }
    }

    const claim: SymbolClaim = {
      key,
      filePath,
      symbolName,
      intent,
      agentId,
      claimedAt: Date.now(),
      estimatedRelease: Date.now() + estimatedMinutes * 60 * 1000,
      priority: 0.5, // will be computed by negotiation engine in Phase 3
    };

    this.claims.set(key, [...existing.filter((c) => c.agentId !== agentId), claim]);

    const keys = this.agentKeys.get(agentId) ?? new Set();
    keys.add(key);
    this.agentKeys.set(agentId, keys);

    return { granted: true, claim };
  }

  release(agentId: string, filePath: string, symbolName: string): boolean {
    const key = symbolKey(filePath, symbolName);
    const existing = this.claims.get(key) ?? [];
    const filtered = existing.filter((c) => c.agentId !== agentId);

    if (filtered.length === 0) {
      this.claims.delete(key);
    } else {
      this.claims.set(key, filtered);
    }

    this.agentKeys.get(agentId)?.delete(key);
    return existing.length !== filtered.length;
  }

  releaseAll(agentId: string): { filePath: string; symbolName: string }[] {
    const keys = this.agentKeys.get(agentId) ?? new Set();
    const released: { filePath: string; symbolName: string }[] = [];

    for (const key of keys) {
      const existing = this.claims.get(key) ?? [];
      const filtered = existing.filter((c) => c.agentId !== agentId);
      if (filtered.length === 0) {
        this.claims.delete(key);
      } else {
        this.claims.set(key, filtered);
      }
      const [filePath, symbolName] = key.split('::');
      released.push({ filePath, symbolName });
    }

    this.agentKeys.delete(agentId);
    return released;
  }

  getClaims(agentId: string): SymbolClaim[] {
    const keys = this.agentKeys.get(agentId) ?? new Set();
    const result: SymbolClaim[] = [];
    for (const key of keys) {
      const claims = this.claims.get(key) ?? [];
      result.push(...claims.filter((c) => c.agentId === agentId));
    }
    return result;
  }

  getClaimsForSymbol(filePath: string, symbolName: string): SymbolClaim[] {
    return this.claims.get(symbolKey(filePath, symbolName)) ?? [];
  }

  getAllClaims(): SymbolClaim[] {
    return Array.from(this.claims.values()).flat();
  }

  // Called by TTL watchdog — removes claims older than CLAIM_TTL_MS
  pruneExpired(): { agentId: string; filePath: string; symbolName: string }[] {
    const now = Date.now();
    const expired: { agentId: string; filePath: string; symbolName: string }[] = [];

    for (const [key, claims] of this.claims) {
      const valid = claims.filter((c) => {
        if (now - c.claimedAt > CLAIM_TTL_MS) {
          expired.push({ agentId: c.agentId, filePath: c.filePath, symbolName: c.symbolName });
          this.agentKeys.get(c.agentId)?.delete(key);
          return false;
        }
        return true;
      });

      if (valid.length === 0) {
        this.claims.delete(key);
      } else {
        this.claims.set(key, valid);
      }
    }

    return expired;
  }
}
