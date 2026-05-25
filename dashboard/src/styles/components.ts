import type { CSSProperties } from 'react';
import { colors, fonts, sizes, spacing } from './tokens';

export const panel: CSSProperties = {
  background: colors.bgPanel,
  border: `1px solid ${colors.borderBright}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: fonts.mono,
  position: 'relative',
};

export const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${spacing.sm}px ${spacing.lg}px`,
  borderBottom: `1px solid ${colors.borderBright}`,
  background: colors.bg,
  flexShrink: 0,
};

export const panelTitle: CSSProperties = {
  fontSize: sizes.sm,
  fontWeight: 700,
  color: colors.green,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  fontFamily: fonts.mono,
};

export const panelCount: CSSProperties = {
  fontSize: sizes.xs,
  color: colors.greenDim,
  fontFamily: fonts.mono,
};

export const panelBody: CSSProperties = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: `${spacing.sm}px 0`,
};

export const tableRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${spacing.xs + 1}px ${spacing.lg}px`,
  fontSize: sizes.sm,
  fontFamily: fonts.mono,
  borderBottom: `1px solid ${colors.border}`,
  gap: spacing.md,
  cursor: 'default',
};

export const tableRowHighlight: CSSProperties = {
  ...tableRow,
  background: colors.bgRow,
};

export const col = (flex: number | string, opts: Partial<CSSProperties> = {}): CSSProperties => ({
  flex,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  ...opts,
});

export const badge = (color: string, bg?: string): CSSProperties => ({
  display: 'inline-block',
  fontSize: sizes.xs,
  fontFamily: fonts.mono,
  color,
  background: bg ?? 'transparent',
  padding: bg ? `0 ${spacing.sm}px` : '0',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
});

export const dimText: CSSProperties = {
  color: colors.gray,
  fontSize: sizes.xs,
  fontFamily: fonts.mono,
};

export const monoText = (color: string = colors.green, size: string = sizes.sm): CSSProperties => ({
  color,
  fontSize: size,
  fontFamily: fonts.mono,
});

export const separator: CSSProperties = {
  borderTop: `1px solid ${colors.border}`,
  margin: `${spacing.sm}px 0`,
};

export const emptyState: CSSProperties = {
  color: colors.gray,
  fontSize: sizes.sm,
  fontFamily: fonts.mono,
  padding: `${spacing.xl}px ${spacing.lg}px`,
  textAlign: 'center' as const,
};
