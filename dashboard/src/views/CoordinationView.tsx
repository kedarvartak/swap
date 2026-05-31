import { AgentId, Card, FilePath, IntentChip, KpiTile, SymbolName, formatAge } from '../components/Primitives';
import type { NegotiationRecord, SymbolClaim } from '../types/swap';
import type { ViewProps } from './types';
import { drawer } from './types';

export function CoordinationView({ state, metrics, onInspect }: ViewProps) {
  const activeNegotiations = state.negotiations.filter((negotiation) => negotiation.active);
  const resolvedNegotiations = state.negotiations.filter((negotiation) => !negotiation.active);

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Coordination</h1>
          <p className="view-subtitle">Symbol locks, auto-claims, TTLs, and negotiation outcomes in one operational surface.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Active claims" value={state.claims.length} />
        <KpiTile label="Write locks" value={state.claims.filter((claim) => claim.intent !== 'read').length} />
        <KpiTile label="Negotiating" value={activeNegotiations.length} tone={activeNegotiations.length > 0 ? 'sev-warning' : undefined} />
        <KpiTile label="Resolved" value={resolvedNegotiations.length} />
        <KpiTile label="Claim p95" value={metrics.claimLatencyP95 === null ? 'n/a' : `${metrics.claimLatencyP95}ms`} />
        <KpiTile label="Policy mode" value="Mixed" detail="Strict + advisory paths" />
      </div>

      <div className="split-grid">
        <Card>
          <h2 className="section-title">Claims</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>File</th>
                <th>Holder</th>
                <th>Intent</th>
                <th>Age</th>
                <th>TTL</th>
              </tr>
            </thead>
            <tbody>
              {state.claims.map((claim) => (
                <ClaimRow key={claim.key} claim={claim} onOpen={() => onInspect(drawer(claim.symbolName, <ClaimDetails claim={claim} />))} />
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="section-title">Negotiations</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {[...activeNegotiations, ...resolvedNegotiations].map((negotiation) => (
              <NegotiationItem key={negotiation.sessionId} negotiation={negotiation} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClaimRow({ claim, onOpen }: { claim: SymbolClaim; onOpen: () => void }) {
  const ttlMs = Math.max(0, claim.estimatedRelease - Date.now());
  const ttl = ttlMs < 60_000 ? `${Math.floor(ttlMs / 1000)}s` : `${Math.floor(ttlMs / 60_000)}m`;
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer' }}>
      <td><SymbolName value={claim.symbolName} /></td>
      <td><FilePath value={claim.filePath} /></td>
      <td><AgentId value={claim.agentShortId} /></td>
      <td><IntentChip intent={claim.intent} /></td>
      <td>{formatAge(claim.claimedAt)}</td>
      <td>{ttl}</td>
    </tr>
  );
}

function ClaimDetails({ claim }: { claim: SymbolClaim }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p><strong>Symbol:</strong> <span className="mono">{claim.symbolName}</span></p>
      <p><strong>File:</strong> <span className="mono">{claim.filePath}</span></p>
      <p><strong>Held by:</strong> <AgentId value={claim.agentShortId} /></p>
      <p><strong>Intent:</strong> <IntentChip intent={claim.intent} /></p>
      <p><strong>Priority:</strong> {claim.priority.toFixed(2)}</p>
    </div>
  );
}

function NegotiationItem({ negotiation }: { negotiation: NegotiationRecord }) {
  return (
    <div className="card" style={{ background: negotiation.active ? 'var(--surface-sunken)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="mono muted">{negotiation.sessionId}</div>
          <strong className="mono">{negotiation.filePath}::{negotiation.symbolName}</strong>
        </div>
        <span className={`chip ${negotiation.active ? 'change-breaking' : 'change-added'}`}>
          {negotiation.active ? 'Live' : negotiation.reason ?? 'resolved'}
        </span>
      </div>
      <PriorityBars negotiation={negotiation} />
      <div className="muted">
        {negotiation.active
          ? 'Awaiting negotiation responses.'
          : `${negotiation.winner} won; ${negotiation.loser} deferred.`}
      </div>
    </div>
  );
}

function PriorityBars({ negotiation }: { negotiation: NegotiationRecord }) {
  return (
    <div style={{ display: 'grid', gap: 6, margin: '12px 0' }}>
      <PriorityBar label={negotiation.agentA} value={negotiation.priorityA} winner={negotiation.winner === negotiation.agentA} />
      <PriorityBar label={negotiation.agentB} value={negotiation.priorityB} winner={negotiation.winner === negotiation.agentB} />
    </div>
  );
}

function PriorityBar({ label, value, winner }: { label: string; value: number; winner: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 42px', gap: 8, alignItems: 'center' }}>
      <AgentId value={label} />
      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-base)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: winner ? 'var(--status-active)' : 'var(--color-accent)' }} />
      </div>
      <span>{value.toFixed(2)}</span>
    </div>
  );
}
