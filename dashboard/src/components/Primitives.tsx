import type { CSSProperties, ReactNode } from 'react';
import type { AgentStatus, ChangeType, ClaimIntent } from '../types/swap';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <section className={`card ${className}`} onClick={onClick} tabIndex={onClick ? 0 : undefined}>
      {children}
    </section>
  );
}

export function KpiTile({ label, value, tone, detail }: { label: string; value: ReactNode; tone?: string; detail?: string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

export function StatusChip({ status }: { status: AgentStatus }) {
  const labels: Record<AgentStatus, string> = {
    active: 'Active',
    idle: 'Idle',
    waiting: 'Waiting',
    done: 'Done',
    disconnected: 'Disconnected',
  };
  return <span className={`chip status status-${status}`}>{labels[status]}</span>;
}

export function IntentChip({ intent }: { intent: ClaimIntent }) {
  return <span className={`chip intent intent-${intent}`}>{intent}</span>;
}

export function ChangeTypeChip({ type }: { type: ChangeType }) {
  const label: Record<ChangeType, string> = {
    ADDED: 'Added',
    DELETED: 'Breaking',
    SIGNATURE_CHANGED: 'Breaking',
    BODY_CHANGED: 'Modified',
    RENAMED: 'Renamed',
    MOVED: 'Moved',
  };
  const tone =
    type === 'ADDED'
      ? 'added'
      : type === 'BODY_CHANGED'
      ? 'modified'
      : type === 'RENAMED' || type === 'MOVED'
      ? 'renamed'
      : 'breaking';
  return <span className={`chip change change-${tone}`}>{label[type]}</span>;
}

export function PhaseTag({ children }: { children: ReactNode }) {
  return <span className="phase-tag">{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-node-map" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  onClick,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick?: () => void;
}) {
  return (
    <button className={`button button-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function FilePath({ value, style }: { value: string; style?: CSSProperties }) {
  return <span className="mono file-path" style={style} title={value}>{middleTruncate(value, 38)}</span>;
}

export function SymbolName({ value }: { value: string }) {
  return <span className="mono symbol-name">{value}</span>;
}

export function AgentId({ value }: { value: string }) {
  return <span className="mono agent-id">{value}</span>;
}

export function formatAge(timestamp: number): string {
  const ms = Math.max(0, Date.now() - timestamp);
  if (ms < 1000) return '<1s';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function middleTruncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 3) / 2);
  return `${value.slice(0, keep)}...${value.slice(value.length - keep)}`;
}
