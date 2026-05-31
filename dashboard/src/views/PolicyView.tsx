import { Button, Card, FilePath, KpiTile, PhaseTag } from '../components/Primitives';
import type { PolicyRule } from '../types/swap';
import type { ViewProps } from './types';

export function PolicyView({ state }: ViewProps) {
  const strictRules = state.policyRules.filter((rule) => rule.mode === 'strict').length;

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Policy</h1>
          <p className="view-subtitle">Path-scoped coordination rules seeded by Phase A and ready to become the Phase D policy engine.</p>
        </div>
        <PhaseTag>Simulated Phase D data</PhaseTag>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Rules" value={state.policyRules.length} />
        <KpiTile label="Strict paths" value={strictRules} />
        <KpiTile label="Advisory paths" value={state.policyRules.length - strictRules} />
        <KpiTile label="Approval gates" value={state.policyRules.filter((rule) => rule.requireApprovalOnBreaking).length} />
        <KpiTile label="Default mode" value="Advisory" />
        <KpiTile label="Preview" value="Live" />
      </div>

      <div className="split-grid">
        <Card>
          <h2 className="section-title">Path rules</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {state.policyRules.map((rule) => (
              <PolicyRuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="section-title">Live preview</h2>
          <p>With these rules, edits to <FilePath value="src/payment/**" /> block on conflict and require approval for breaking changes.</p>
          <p className="muted">The shape maps to `COORDINATION_POLICY`: default mode plus ordered path overrides.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="primary">Save draft</Button>
            <Button>Validate policy</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PolicyRuleRow({ rule }: { rule: PolicyRule }) {
  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
      <div>
        <div><FilePath value={rule.pattern} /></div>
        <div className="muted" style={{ marginTop: 6 }}>{rule.description}</div>
      </div>
      <span className={`chip ${rule.mode === 'strict' ? 'change-breaking' : 'change-modified'}`}>{rule.mode}</span>
      <span className={`chip ${rule.requireApprovalOnBreaking ? 'intent-write' : 'status-idle'}`}>
        {rule.requireApprovalOnBreaking ? 'approval on breaking' : 'no approval gate'}
      </span>
    </div>
  );
}
