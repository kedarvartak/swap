import { AgentId, Button, Card, FilePath, KpiTile, PhaseTag, SymbolName, formatAge } from '../components/Primitives';
import type { Approval } from '../types/swap';
import type { ViewProps } from './types';

export function ApprovalsView({ state }: ViewProps) {
  const pending = state.approvals.filter((approval) => approval.status === 'pending');
  const decided = state.approvals.filter((approval) => approval.status !== 'pending');

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Approvals</h1>
          <p className="view-subtitle">Human gate for policy-flagged high-impact edits, including signature changes and broad blast radius.</p>
        </div>
        <PhaseTag>Simulated Phase D data</PhaseTag>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Pending" value={pending.length} tone={pending.length > 0 ? 'change-breaking' : undefined} />
        <KpiTile label="Approved" value={decided.filter((approval) => approval.status === 'approved').length} />
        <KpiTile label="Rejected" value={decided.filter((approval) => approval.status === 'rejected').length} />
        <KpiTile label="Largest blast radius" value={Math.max(...state.approvals.map((approval) => approval.blastRadius), 0)} />
        <KpiTile label="Policy mode" value="Strict" detail="payments/auth" />
        <KpiTile label="Audit write" value="Ready" detail="Phase D" />
      </div>

      <div className="cards-grid">
        {state.approvals.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: Approval }) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <AgentId value={approval.agentShortId} /> <span className="muted">{approval.taskDescription}</span>
        </div>
        <span className={`chip ${approval.status === 'pending' ? 'change-breaking' : 'change-added'}`}>{approval.status}</span>
      </div>
      <h2 className="section-title" style={{ marginTop: 14 }}><SymbolName value={approval.symbolName} /></h2>
      <FilePath value={approval.filePath} />
      <div className="card" style={{ marginTop: 12, background: 'var(--surface-sunken)' }}>
        <div className="muted">Signature diff</div>
        <div className="mono" style={{ color: 'var(--change-breaking)', marginTop: 8 }}>- {approval.beforeSignature}</div>
        <div className="mono" style={{ color: 'var(--change-added)' }}>+ {approval.afterSignature}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <span className="muted">Blast radius: {approval.blastRadius} symbols · requested {formatAge(approval.requestedAt)} ago</span>
      </div>
      {approval.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Button variant="primary">Approve</Button>
          <Button variant="danger">Reject</Button>
        </div>
      )}
    </Card>
  );
}
