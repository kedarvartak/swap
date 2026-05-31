import { Card, KpiTile, PhaseTag, formatTimestamp } from '../components/Primitives';
import type { ViewProps } from './types';

export function ReplayView({ state }: ViewProps) {
  const first = state.auditEvents[state.auditEvents.length - 1]?.timestamp ?? Date.now();
  const last = state.auditEvents[0]?.timestamp ?? Date.now();
  const spanMinutes = Math.max(1, Math.round((last - first) / 60_000));

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Timeline / Replay</h1>
          <p className="view-subtitle">Scrub through a session and reconstruct fleet state from the audit stream. The histogram is simulated until Phase D persistence lands.</p>
        </div>
        <PhaseTag>Simulated Phase D data</PhaseTag>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Session span" value={`${spanMinutes}m`} />
        <KpiTile label="Events" value={state.auditEvents.length} />
        <KpiTile label="Conflicts" value={state.negotiations.length} />
        <KpiTile label="Breaking markers" value={state.diffs.reduce((sum, diff) => sum + diff.stats.breaking, 0)} />
        <KpiTile label="Replay state" value="Paused" />
        <KpiTile label="Step size" value="1 event" />
      </div>

      <Card>
        <h2 className="section-title">Replay scrubber</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 64px', gap: 12, alignItems: 'center' }}>
          <span className="mono muted">{formatTimestamp(first)}</span>
          <div style={{ height: 92, display: 'flex', alignItems: 'end', gap: 4, borderBottom: '1px solid var(--border-strong)' }}>
            {Array.from({ length: 30 }).map((_, index) => (
              <span
                key={index}
                style={{
                  flex: 1,
                  height: `${18 + ((index * 17) % 70)}px`,
                  background: index % 7 === 0 ? 'var(--change-breaking)' : 'var(--color-accent-muted)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
            ))}
          </div>
          <span className="mono muted">{formatTimestamp(last)}</span>
        </div>
        <input type="range" min={0} max={100} defaultValue={68} style={{ width: '100%', marginTop: 18 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="button">Step back</button>
          <button className="button button-primary">Play</button>
          <button className="button">Step forward</button>
        </div>
      </Card>
    </div>
  );
}
