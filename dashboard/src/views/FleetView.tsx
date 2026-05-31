import { AgentId, Card, FilePath, KpiTile, StatusChip, formatAge } from '../components/Primitives';
import type { AgentRecord } from '../types/swap';
import type { ViewProps } from './types';
import { drawer } from './types';

export function FleetView({ state, metrics, onInspect, setActiveView }: ViewProps) {
  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Fleet</h1>
          <p className="view-subtitle">Live operating view for connected coding agents, their health, current claims, and coordination pressure.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Active agents" value={metrics.activeAgents} detail={`${state.agents.length} connected`} />
        <KpiTile label="Open conflicts" value={metrics.openConflicts} tone={metrics.openConflicts > 0 ? 'sev-warning' : undefined} />
        <KpiTile label="Pending approvals" value={metrics.pendingApprovals} tone={metrics.pendingApprovals > 0 ? 'change-breaking' : undefined} detail="Phase D queue" />
        <KpiTile label="Breaking last 1h" value={metrics.breakingChangesLastHour} tone={metrics.breakingChangesLastHour > 0 ? 'change-breaking' : undefined} />
        <KpiTile label="Claim p95" value={metrics.claimLatencyP95 === null ? 'n/a' : `${metrics.claimLatencyP95}ms`} />
        <KpiTile label="Throughput" value={metrics.throughputPerMinute.toFixed(1)} detail="edits/min" />
      </div>

      <div className="cards-grid">
        {state.agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onOpen={() => onInspect(drawer(`Agent ${agent.shortId}`, <AgentDetails agent={agent} state={state} setActiveView={setActiveView} />))}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, onOpen }: { agent: AgentRecord; onOpen: () => void }) {
  return (
    <Card className="clickable" onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <AgentId value={agent.shortId} />
        <StatusChip status={agent.status} />
      </div>
      <h2 className="section-title" style={{ marginTop: 14 }}>{agent.taskDescription}</h2>
      <div className="muted" style={{ display: 'grid', gap: 8 }}>
        <span>{agent.claimCount} current claim{agent.claimCount === 1 ? '' : 's'}</span>
        <span>Heartbeat {formatAge(agent.lastHeartbeat)} ago</span>
        <FilePath value={agent.worktreePath} />
      </div>
      <div style={{ marginTop: 14, height: 22, display: 'flex', alignItems: 'end', gap: 3 }} aria-hidden="true">
        {[0.4, 0.7, 0.35, 0.9, 0.58, agent.priorityScore].map((value, index) => (
          <span
            key={index}
            style={{
              width: 18,
              height: `${Math.max(5, value * 22)}px`,
              borderRadius: 3,
              background: index === 5 ? 'var(--color-accent)' : 'var(--border-strong)',
            }}
          />
        ))}
      </div>
    </Card>
  );
}

function AgentDetails({ agent, state, setActiveView }: { agent: AgentRecord; state: ViewProps['state']; setActiveView: ViewProps['setActiveView'] }) {
  const claims = state.claims.filter((claim) => claim.agentId === agent.id);
  const diffs = state.diffs.filter((diff) => diff.agentId === agent.id);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div className="muted">Task</div>
        <p>{agent.taskDescription}</p>
      </div>
      <div>
        <div className="muted">Claims</div>
        {claims.length === 0 ? (
          <p>No active claims.</p>
        ) : (
          <ul>
            {claims.map((claim) => (
              <li key={claim.key}>
                <span className="mono">{claim.filePath}::{claim.symbolName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="muted">Recent diffs</div>
        <p>{diffs.length} semantic diff{diffs.length === 1 ? '' : 's'} recorded.</p>
      </div>
      <button className="button button-primary" onClick={() => setActiveView('coordination')}>Open coordination view</button>
    </div>
  );
}
