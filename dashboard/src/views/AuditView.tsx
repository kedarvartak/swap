import { AgentId, FilePath, KpiTile, PhaseTag, formatTimestamp } from '../components/Primitives';
import type { ViewProps } from './types';

export function AuditView({ state }: ViewProps) {
  const blocked = state.auditEvents.filter((event) => event.outcome === 'blocked' || event.outcome === 'deferred').length;

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Audit Log</h1>
          <p className="view-subtitle">Immutable governance stream for claims, releases, negotiations, policy decisions, and approvals.</p>
        </div>
        <PhaseTag>Simulated Phase D data</PhaseTag>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Audit events" value={state.auditEvents.length} />
        <KpiTile label="Deferred or blocked" value={blocked} tone={blocked > 0 ? 'sev-warning' : undefined} />
        <KpiTile label="Approvals" value={state.auditEvents.filter((event) => event.action === 'approval').length} />
        <KpiTile label="Policy decisions" value={state.auditEvents.filter((event) => event.action === 'policy_decision').length} />
        <KpiTile label="Export" value="CSV" detail="JSON ready" />
        <KpiTile label="Retention" value="Local" detail="Phase D store" />
      </div>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Events</h2>
          <input placeholder="Search actor, file, symbol" style={inputStyle} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Outcome</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {state.auditEvents.map((event) => (
              <tr key={event.id}>
                <td className="mono">{formatTimestamp(event.timestamp)}</td>
                <td><AgentId value={event.actor} /></td>
                <td>{event.action.replace('_', ' ')}</td>
                <td><FilePath value={event.target} /></td>
                <td><span className={`chip ${event.outcome === 'granted' || event.outcome === 'approved' ? 'change-added' : 'change-breaking'}`}>{event.outcome}</span></td>
                <td>{event.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const inputStyle = {
  minWidth: 240,
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  background: 'var(--surface-sunken)',
  color: 'var(--content-primary)',
  padding: '8px 10px',
};
