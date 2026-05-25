import type { CSSProperties } from 'react';
import type { SymbolClaim, ClaimIntent } from '../types/swap';
import { colors, fonts, sizes, spacing } from '../styles/tokens';
import { panel, panelHeader, panelTitle, panelCount, panelBody, tableRow, dimText } from '../styles/components';

interface ClaimsPanelProps {
  claims: SymbolClaim[];
}

function intentColor(intent: ClaimIntent): string {
  switch (intent) {
    case 'write':   return colors.amber;
    case 'refactor': return colors.cyan;
    case 'delete':  return colors.red;
    case 'read':    return colors.greenDim;
  }
}

function intentLabel(intent: ClaimIntent): string {
  return `[${intent.toUpperCase()}]`;
}

function claimedDuration(claimedAt: number): string {
  const ms = Date.now() - claimedAt;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

const s = {
  intentBadge: (intent: ClaimIntent): CSSProperties => ({
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: intentColor(intent),
    minWidth: 72,
    flexShrink: 0,
  }),

  agentId: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.cyan,
    minWidth: 36,
    flexShrink: 0,
  } as CSSProperties,

  symbolName: {
    fontSize: sizes.sm,
    fontFamily: fonts.mono,
    color: colors.green,
    fontWeight: 700,
  } as CSSProperties,

  filePath: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.gray,
  } as CSSProperties,

  priorityScore: (p: number): CSSProperties => ({
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: p > 0.7 ? colors.green : p > 0.4 ? colors.amber : colors.gray,
    minWidth: 36,
    textAlign: 'right' as const,
    flexShrink: 0,
  }),
};

function ClaimRow({ claim, index }: { claim: SymbolClaim; index: number }) {
  const rowStyle: CSSProperties = {
    ...tableRow,
    background: index % 2 === 0 ? 'transparent' : colors.bgRow,
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.lg}px`,
  };

  return (
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, width: '100%' }}>
        <span style={s.agentId}>{claim.agentShortId}</span>
        <span style={s.intentBadge(claim.intent)}>{intentLabel(claim.intent)}</span>
        <span style={s.symbolName}>{claim.symbolName}</span>
        <span style={{ ...dimText, marginLeft: 'auto', flexShrink: 0 }}>{claimedDuration(claim.claimedAt)}</span>
        <span style={s.priorityScore(claim.priority)}>{claim.priority.toFixed(2)}</span>
      </div>
      <div style={{ paddingLeft: 42 }}>
        <span style={s.filePath}>{claim.filePath}</span>
        <span style={{ ...dimText, marginLeft: spacing.sm }}>[{claim.symbolKind}]</span>
      </div>
    </div>
  );
}

export function ClaimsPanel({ claims }: ClaimsPanelProps) {
  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ LIVE CLAIMS ├</span>
        <span style={panelCount}>{claims.length} active</span>
      </div>
      <div style={panelBody}>
        {claims.length === 0
          ? <div style={{ color: colors.gray, fontSize: sizes.sm, fontFamily: fonts.mono, padding: spacing.xl, textAlign: 'center' }}>no active claims</div>
          : claims.map((c, i) => <ClaimRow key={c.key} claim={c} index={i} />)
        }
      </div>
    </div>
  );
}
