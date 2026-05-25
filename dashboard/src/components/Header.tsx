import type { CSSProperties } from 'react';
import { colors, fonts, sizes, spacing } from '../styles/tokens';

interface HeaderProps {
  agentCount: number;
  claimCount: number;
  activeNegotiations: number;
  tick: number;
}

const s = {
  root: {
    background: colors.bg,
    borderBottom: `1px solid ${colors.green}`,
    padding: `${spacing.md}px ${spacing.xl}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    position: 'relative' as const,
    overflow: 'hidden',
    animation: 'flicker 8s infinite',
  } as CSSProperties,

  scanline: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: `linear-gradient(transparent, ${colors.green}33, transparent)`,
    animation: 'scanline 4s linear infinite',
    pointerEvents: 'none' as const,
  } as CSSProperties,

  left: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.xl,
  } as CSSProperties,

  logo: {
    fontSize: sizes.xxl,
    fontWeight: 700,
    fontFamily: fonts.mono,
    color: colors.green,
    letterSpacing: '0.3em',
    textShadow: `0 0 20px ${colors.green}66`,
  } as CSSProperties,

  subtitle: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.greenDim,
    letterSpacing: '0.15em',
  } as CSSProperties,

  stats: {
    display: 'flex',
    gap: spacing.xxl,
    alignItems: 'center',
  } as CSSProperties,

  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
  } as CSSProperties,

  statValue: {
    fontSize: sizes.xl,
    fontFamily: fonts.mono,
    fontWeight: 700,
    color: colors.green,
  } as CSSProperties,

  statValueConflict: {
    fontSize: sizes.xl,
    fontFamily: fonts.mono,
    fontWeight: 700,
    color: colors.amber,
    animation: 'pulse 1.5s infinite',
  } as CSSProperties,

  statLabel: {
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.gray,
    letterSpacing: '0.1em',
  } as CSSProperties,

  cursor: {
    display: 'inline-block',
    width: 8,
    height: 14,
    background: colors.green,
    marginLeft: 2,
    animation: 'blink 1s step-end infinite',
    verticalAlign: 'middle',
  } as CSSProperties,

  right: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: colors.greenDim,
  } as CSSProperties,
};

export function Header({ agentCount, claimCount, activeNegotiations, tick }: HeaderProps) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);

  return (
    <div style={s.root}>
      <div style={s.scanline} />
      <div style={s.left}>
        <div style={s.logo}>
          SWAP<span style={s.cursor} />
        </div>
        <div style={s.subtitle}>// COORDINATION MONITOR v1.0</div>
      </div>

      <div style={s.stats}>
        <div style={s.stat}>
          <span style={s.statValue}>{agentCount}</span>
          <span style={s.statLabel}>AGENTS</span>
        </div>
        <div style={s.stat}>
          <span style={s.statValue}>{claimCount}</span>
          <span style={s.statLabel}>CLAIMS</span>
        </div>
        <div style={s.stat}>
          <span style={activeNegotiations > 0 ? s.statValueConflict : s.statValue}>
            {activeNegotiations}
          </span>
          <span style={s.statLabel}>CONFLICTS</span>
        </div>
      </div>

      <div style={s.right}>
        <span>TICK {String(tick).padStart(4, '0')}</span>
        <span style={{ color: colors.grayDim }}>|</span>
        <span>{ts} UTC</span>
      </div>
    </div>
  );
}
