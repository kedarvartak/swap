export type ViewId =
  | 'fleet'
  | 'impact'
  | 'coordination'
  | 'activity'
  | 'audit'
  | 'replay'
  | 'policy'
  | 'approvals'
  | 'settings';

export interface RouteConfig {
  id: ViewId;
  label: string;
  shortLabel: string;
  group: 'Monitor' | 'Govern' | 'System';
  phase: 'live' | 'phase-b' | 'phase-d' | 'local';
}

export const routes: RouteConfig[] = [
  { id: 'fleet', label: 'Fleet', shortLabel: 'FL', group: 'Monitor', phase: 'live' },
  { id: 'impact', label: 'Impact Graph', shortLabel: 'IG', group: 'Monitor', phase: 'phase-b' },
  { id: 'coordination', label: 'Coordination', shortLabel: 'CO', group: 'Monitor', phase: 'live' },
  { id: 'activity', label: 'Activity', shortLabel: 'AC', group: 'Monitor', phase: 'live' },
  { id: 'audit', label: 'Audit Log', shortLabel: 'AU', group: 'Govern', phase: 'phase-d' },
  { id: 'replay', label: 'Timeline / Replay', shortLabel: 'RP', group: 'Govern', phase: 'phase-d' },
  { id: 'policy', label: 'Policy', shortLabel: 'PO', group: 'Govern', phase: 'phase-d' },
  { id: 'approvals', label: 'Approvals', shortLabel: 'AP', group: 'Govern', phase: 'phase-d' },
  { id: 'settings', label: 'Settings', shortLabel: 'SE', group: 'System', phase: 'local' },
];
