import type { CSSProperties } from 'react';
import type { AgentRecord, AgentStatus } from '../types/swap';
import { colors, fonts, sizes } from '../styles/tokens';
import { panel, panelHeader, panelTitle, panelCount, panelBody, tableRow, dimText } from '../styles/components';

interface AgentsPanelProps {
  agents: AgentRecord[];
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'active':       return colors.green;
    case 'waiting':      return colors.amber;
    case 'idle':         return colors.gray;
    case 'done':         return colors.cyanDim;
    case 'disconnected': return colors.red;
  }
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'active':       return '[ACTIVE]';
    case 'waiting':      return '[WAIT]';
    case 'idle':         return '[IDLE]';
    case 'done':         return '[DONE]';
    case 'disconnected': return '[DEAD]';
  }
}

function heartbeatAge(lastHeartbeat: number): string {
  const ms = Date.now() - lastHeartbeat;
  if (ms < 1000)  return '<1s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m`;
}

const s = {
  statusBadge: (status: AgentStatus): CSSProperties => ({
    fontSize: sizes.xs,
    fontFamily: fonts.mono,
    color: statusColor(status),
    flexShrink: 0,
    minWidth: 70,
    animation: status === 'active' ? 'pulse 2s infinite' : undefined,
  }),

  priorityBar: (score: number): CSSProperties => ({
    height: 3,
    width: `${score * 60}px`,
    background: score > 0.7 ? colors.green : score > 0.4 ? colors.amber : colors.redDim,
    flexShrink: 0,
  }),

  agentId: {
    fontSize: sizes.sm,
    fontFamily: fonts.mono,
    color: colors.cyan,
    fontWeight: 700,
    minWidth: 42,
    flexShrink: 0,
  } as CSSProperties,
};

function AgentRow({ agent, index }: { agent: AgentRecord; index: number }) {
  const rowStyle: CSSProperties = {
    ...tableRow,
    background: index % 2 === 0 ? 'transparent' : colors.bgRow,
  };
  return (
    <div style={rowStyle}>
      <span style={s.agentId}>{agent.shortId}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.white, fontSize: sizes.sm }}>{agent.taskDescription}</span>
      <span style={s.statusBadge(agent.status)}>{statusLabel(agent.status)}</span>
      <span style={{ ...dimText, minWidth: 28, textAlign: 'right' as const }}>{agent.claimCount}c</span>
      <div style={s.priorityBar(agent.priorityScore)} title={`priority: ${agent.priorityScore.toFixed(2)}`} />
      <span style={{ ...dimText, minWidth: 30, textAlign: 'right' as const }}>{heartbeatAge(agent.lastHeartbeat)}</span>
    </div>
  );
}

export function AgentsPanel({ agents }: AgentsPanelProps) {
  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ AGENTS ├</span>
        <span style={panelCount}>{agents.length} connected</span>
      </div>
      <div style={panelBody}>
        {agents.map((a, i) => <AgentRow key={a.id} agent={a} index={i} />)}
      </div>
    </div>
  );
}
