import type { CSSProperties } from 'react';
import type { SemanticDiff, ChangeType } from '../types/swap';
import { colors, fonts, sizes, spacing } from '../styles/tokens';
import { panel, panelHeader, panelTitle, panelCount, panelBody, dimText } from '../styles/components';

interface SemanticDiffsPanelProps {
  diffs: SemanticDiff[];
}

function changeColor(ct: ChangeType): string {
  switch (ct) {
    case 'ADDED':            return colors.green;
    case 'DELETED':          return colors.red;
    case 'SIGNATURE_CHANGED': return colors.amber;
    case 'BODY_CHANGED':     return colors.cyan;
    case 'RENAMED':          return colors.cyanDim;
    case 'MOVED':            return colors.greenDim;
  }
}

function elapsed(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

const s = {
  diffBlock: (hasBreaking: boolean): CSSProperties => ({
    borderBottom: `1px solid ${hasBreaking ? colors.red + '33' : colors.border}`,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    background: hasBreaking ? colors.red + '05' : 'transparent',
  }),

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  } as CSSProperties,

  agentId: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.cyan,
    flexShrink: 0,
  } as CSSProperties,

  filePath: {
    fontSize: sizes.sm,
    fontFamily: fonts.mono,
    color: colors.white,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  breakingBadge: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.red,
    flexShrink: 0,
    animation: 'pulse 1.5s infinite',
  } as CSSProperties,

  statBar: {
    display: 'flex',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  } as CSSProperties,

  statChip: (color: string): CSSProperties => ({
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color,
  }),

  changeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs}px 0`,
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
  } as CSSProperties,
};

function DiffBlock({ diff }: { diff: SemanticDiff }) {
  const hasBreaking = diff.stats.breaking > 0;
  return (
    <div style={s.diffBlock(hasBreaking)}>
      <div style={s.header}>
        <span style={s.agentId}>{diff.agentShortId}</span>
        <span style={s.filePath}>{diff.filePath}</span>
        {hasBreaking && <span style={s.breakingBadge}>[BREAKING]</span>}
        <span style={{ ...dimText, flexShrink: 0 }}>{elapsed(diff.releasedAt)}</span>
      </div>
      <div style={s.statBar}>
        {diff.stats.added > 0   && <span style={s.statChip(colors.green)}>+{diff.stats.added} added</span>}
        {diff.stats.deleted > 0 && <span style={s.statChip(colors.red)}>-{diff.stats.deleted} deleted</span>}
        {diff.stats.modified > 0 && <span style={s.statChip(colors.amber)}>~{diff.stats.modified} modified</span>}
      </div>
      {diff.changes.map((c) => (
        <div key={c.symbolName} style={s.changeRow}>
          <span style={{ color: changeColor(c.changeType), minWidth: 90 }}>{c.changeType}</span>
          <span style={{ color: colors.white }}>{c.symbolName}</span>
          <span style={{ color: colors.gray }}>[{c.symbolKind}]</span>
          <span style={{ color: colors.grayDim, flex: 1 }}>— {c.summary}</span>
        </div>
      ))}
    </div>
  );
}

export function SemanticDiffsPanel({ diffs }: SemanticDiffsPanelProps) {
  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ SEMANTIC DIFFS ├</span>
        <span style={panelCount}>{diffs.length} recent</span>
      </div>
      <div style={panelBody}>
        {diffs.map((d) => <DiffBlock key={d.id} diff={d} />)}
      </div>
    </div>
  );
}
