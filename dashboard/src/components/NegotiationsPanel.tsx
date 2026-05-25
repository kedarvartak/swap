import type { CSSProperties } from 'react';
import type { NegotiationRecord, NegotiationReason } from '../types/swap';
import { colors, fonts, sizes, spacing } from '../styles/tokens';
import { panel, panelHeader, panelTitle, panelCount, panelBody, dimText } from '../styles/components';

interface NegotiationsPanelProps {
  negotiations: NegotiationRecord[];
}

function reasonLabel(reason: NegotiationReason | null, active: boolean): string {
  if (active) return '[LIVE]';
  switch (reason) {
    case 'priority':  return '[PRIORITY]';
    case 'tie-break': return '[TIE-BREAK]';
    case 'timeout':   return '[TIMEOUT]';
    default:          return '[?]';
  }
}

function reasonColor(reason: NegotiationReason | null, active: boolean): string {
  if (active) return colors.amber;
  switch (reason) {
    case 'priority':  return colors.green;
    case 'tie-break': return colors.cyan;
    case 'timeout':   return colors.red;
    default:          return colors.gray;
  }
}

function elapsed(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60000)}m ago`;
}

const s = {
  rowBase: (active: boolean): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderBottom: `1px solid ${active ? colors.amber + '33' : colors.border}`,
    background: active ? colors.amber + '08' : 'transparent',
    animation: active ? 'pulse 2s infinite' : undefined,
  }),

  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  } as CSSProperties,

  sessionId: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.grayDim,
  } as CSSProperties,

  vsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 0,
    fontSize: sizes.sm,
    fontFamily: fonts.mono,
  } as CSSProperties,

  agentTag: (winner: boolean): CSSProperties => ({
    color: winner ? colors.green : colors.gray,
    fontWeight: winner ? 700 : 400,
    fontFamily: fonts.mono,
    fontSize: sizes.sm,
  }),

  vs: {
    color: colors.grayDim,
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
  } as CSSProperties,

  wonLabel: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.green,
    marginLeft: spacing.sm,
  } as CSSProperties,
};

function NegotiationRow({ neg }: { neg: NegotiationRecord }) {
  const color = reasonColor(neg.reason, neg.active);
  const label = reasonLabel(neg.reason, neg.active);
  const aWon = neg.winner === neg.agentA;
  const bWon = neg.winner === neg.agentB;

  return (
    <div style={s.rowBase(neg.active)}>
      <div style={s.topRow}>
        <span style={{ ...dimText, fontFamily: fonts.mono, fontSize: sizes.xs }}>
          {neg.sessionId.slice(0, 14)}
        </span>
        <span style={{ color, fontSize: sizes.xs, fontFamily: fonts.mono }}>{label}</span>
        <span style={{ ...dimText, marginLeft: 'auto' }}>{elapsed(neg.startedAt)}</span>
      </div>
      <div style={s.vsRow}>
        <span style={s.agentTag(aWon)}>{neg.agentA}</span>
        <span style={{ color: colors.amber, fontSize: sizes.xs, fontFamily: fonts.mono, margin: `0 ${spacing.xs}px` }}>vs</span>
        <span style={s.agentTag(bWon)}>{neg.agentB}</span>
        {!neg.active && neg.winner && (
          <span style={s.wonLabel}>→ {neg.winner} wins</span>
        )}
      </div>
      <div style={{ ...dimText, fontSize: sizes.xs }}>
        {neg.filePath}::{neg.symbolName}
        {'  '}
        <span style={{ color: colors.greenDim }}>
          {neg.agentA}:{neg.priorityA.toFixed(2)}
        </span>
        {' '}
        <span style={{ color: colors.grayDim }}>
          {neg.agentB}:{neg.priorityB.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function NegotiationsPanel({ negotiations }: NegotiationsPanelProps) {
  const active = negotiations.filter((n) => n.active);
  const resolved = negotiations.filter((n) => !n.active);

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ NEGOTIATIONS ├</span>
        <span style={{ ...panelCount, color: active.length > 0 ? colors.amber : colors.greenDim }}>
          {active.length} active · {resolved.length} resolved
        </span>
      </div>
      <div style={panelBody}>
        {[...active, ...resolved].map((n) => (
          <NegotiationRow key={n.sessionId} neg={n} />
        ))}
      </div>
    </div>
  );
}
