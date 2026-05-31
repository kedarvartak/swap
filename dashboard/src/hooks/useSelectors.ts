import { useMemo } from 'react';
import type { DashboardState, SymbolClaim, SymbolKey } from '../types/swap';

export interface DashboardMetrics {
  activeAgents: number;
  openConflicts: number;
  pendingApprovals: number;
  breakingChangesLastHour: number;
  claimLatencyP95: number | null;
  throughputPerMinute: number;
  fleetHealth: 'healthy' | 'attention' | 'offline';
  claimLookup: Map<SymbolKey, SymbolClaim>;
}

export function useDashboardMetrics(state: DashboardState): DashboardMetrics {
  return useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const activeAgents = state.agents.filter((agent) => agent.status === 'active').length;
    const openConflicts = state.negotiations.filter((negotiation) => negotiation.active).length;
    const pendingApprovals = state.approvals.filter((approval) => approval.status === 'pending').length;
    const breakingChangesLastHour = state.diffs
      .filter((diff) => diff.releasedAt >= oneHourAgo)
      .reduce((sum, diff) => sum + diff.stats.breaking, 0);
    const claimLatencyP95 = percentile(state.claimLatencySamples, 0.95);
    const claimLookup = new Map(state.claims.map((claim) => [claim.key, claim]));
    const fleetHealth =
      state.agents.length === 0
        ? 'offline'
        : openConflicts > 0 || pendingApprovals > 0 || breakingChangesLastHour > 0
        ? 'attention'
        : 'healthy';

    return {
      activeAgents,
      openConflicts,
      pendingApprovals,
      breakingChangesLastHour,
      claimLatencyP95,
      throughputPerMinute: state.throughputPerMinute,
      fleetHealth,
      claimLookup,
    };
  }, [state]);
}

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * pct) - 1);
  return sorted[index];
}
