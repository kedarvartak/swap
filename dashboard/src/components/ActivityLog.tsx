import { useEffect, useRef, type CSSProperties } from 'react';
import type { LogEvent, LogEventType } from '../types/swap';
import { colors, fonts, sizes, spacing } from '../styles/tokens';
import { panel, panelHeader, panelTitle } from '../styles/components';

interface ActivityLogProps {
  events: LogEvent[];
}

function eventColor(type: LogEventType): string {
  switch (type) {
    case 'AGENT_JOIN':  return colors.green;
    case 'AGENT_LEAVE': return colors.red;
    case 'CLAIM':       return colors.cyan;
    case 'RELEASE':     return colors.cyanDim;
    case 'CONFLICT':    return colors.amber;
    case 'RESOLVE':     return colors.green;
    case 'DIFF':        return colors.white;
    case 'HEARTBEAT':   return colors.grayDim;
    case 'NEGOTIATE':   return colors.amber;
  }
}

function eventTag(type: LogEventType): string {
  const tags: Record<LogEventType, string> = {
    AGENT_JOIN:  'JOIN    ',
    AGENT_LEAVE: 'LEAVE   ',
    CLAIM:       'CLAIM   ',
    RELEASE:     'RELEASE ',
    CONFLICT:    'CONFLICT',
    RESOLVE:     'RESOLVE ',
    DIFF:        'DIFF    ',
    HEARTBEAT:   'BEAT    ',
    NEGOTIATE:   'NEGOT   ',
  };
  return tags[type];
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

const s = {
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: `${spacing.sm}px 0`,
  } as CSSProperties,

  line: (type: LogEventType, isNew: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: `${spacing.xs}px ${spacing.lg}px`,
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    borderLeft: type === 'CONFLICT' || type === 'NEGOTIATE'
      ? `2px solid ${colors.amber}`
      : type === 'RESOLVE'
      ? `2px solid ${colors.green}`
      : type === 'DIFF'
      ? `2px solid ${colors.cyan}44`
      : '2px solid transparent',
    animation: isNew ? 'fadeIn 0.3s ease' : undefined,
    background: isNew ? colors.green + '06' : 'transparent',
  }),

  time: {
    color: colors.grayDim,
    flexShrink: 0,
    letterSpacing: '0.02em',
  } as CSSProperties,

  tag: (type: LogEventType): CSSProperties => ({
    color: eventColor(type),
    flexShrink: 0,
    fontWeight: 700,
    minWidth: 68,
  }),

  agentId: {
    color: colors.cyan,
    flexShrink: 0,
    minWidth: 36,
  } as CSSProperties,

  message: (type: LogEventType): CSSProperties => ({
    color: type === 'HEARTBEAT' ? colors.gray : colors.white,
    flex: 1,
    wordBreak: 'break-all' as const,
  }),
};

export function ActivityLog({ events }: ActivityLogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(events.length);

  useEffect(() => {
    if (events.length !== prevLenRef.current) {
      prevLenRef.current = events.length;
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    }
  }, [events.length]);

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ ACTIVITY LOG ├</span>
        <span style={{ fontSize: sizes.xs, color: colors.greenDim, fontFamily: fonts.mono }}>
          {events.length} events · auto-scroll
          <span style={{ display: 'inline-block', width: 6, height: 6, background: colors.green, marginLeft: 6, animation: 'pulse 1s infinite' }} />
        </span>
      </div>
      <div style={s.body} ref={bodyRef}>
        {events.map((e, i) => {
          const isNew = i >= events.length - 3;
          return (
            <div key={e.id} style={s.line(e.type, isNew)}>
              <span style={s.time}>{formatTime(e.timestamp)}</span>
              <span style={s.tag(e.type)}>{eventTag(e.type)}</span>
              {e.agentShortId
                ? <span style={s.agentId}>{e.agentShortId}</span>
                : <span style={{ ...s.agentId, color: colors.grayDim }}>----</span>
              }
              <span style={s.message(e.type)}>{e.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
