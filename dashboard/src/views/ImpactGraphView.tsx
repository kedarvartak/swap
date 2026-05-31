import { AgentId, Card, EmptyState, FilePath, IntentChip, KpiTile, PhaseTag, SymbolName } from '../components/Primitives';
import type { ImpactGraphNode } from '../types/swap';
import type { ViewProps } from './types';
import { drawer } from './types';

export function ImpactGraphView({ state, metrics, onInspect }: ViewProps) {
  const graph = state.impactGraph;
  const claimedNodes = graph.nodes.filter((node) => node.claimedBy).length;
  const breakingNodes = graph.nodes.filter((node) => node.breakingImpact).length;
  const unresolvedEdges = graph.edges.filter((edge) => edge.unresolved).length;

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Impact Graph</h1>
          <p className="view-subtitle">Cross-file symbol topology overlaid with live claim rings and breaking-change blast radius. Phase B data is simulated until indexing lands.</p>
        </div>
        {graph.simulated && <PhaseTag>Simulated Phase B data</PhaseTag>}
      </div>

      <div className="kpi-strip">
        <KpiTile label="Symbols" value={graph.nodes.length} />
        <KpiTile label="Edges" value={graph.edges.length} />
        <KpiTile label="Claimed nodes" value={claimedNodes} />
        <KpiTile label="Breaking impacted" value={breakingNodes} tone={breakingNodes > 0 ? 'change-breaking' : undefined} />
        <KpiTile label="Unresolved edges" value={unresolvedEdges} detail="dashed links" />
        <KpiTile label="Conflict pressure" value={metrics.openConflicts} />
      </div>

      {graph.nodes.length === 0 ? (
        <EmptyState title="No graph index yet" body="Run swap index when Phase B is available. The dashboard will render a cross-file symbol graph here." />
      ) : (
        <div className="split-grid" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
          <Card>
            <h2 className="section-title">Filters</h2>
            <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <span className="muted">Search symbol</span>
              <input placeholder="validateSession" style={inputStyle} />
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              <label><input type="checkbox" defaultChecked /> only claimed</label>
              <label><input type="checkbox" defaultChecked /> breaking impacted</label>
              <label><input type="checkbox" /> unresolved imports</label>
            </div>
            <h2 className="section-title" style={{ marginTop: 18 }}>Legend</h2>
            <Legend />
          </Card>
          <Card>
            <GraphCanvas nodes={graph.nodes} onInspect={(node) => onInspect(drawer(node.symbolName, <NodeDetails node={node} />))} />
          </Card>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  background: 'var(--surface-sunken)',
  color: 'var(--content-primary)',
  padding: '9px 10px',
};

function GraphCanvas({ nodes, onInspect }: { nodes: ImpactGraphNode[]; onInspect: (node: ImpactGraphNode) => void }) {
  const points = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    const radius = 170;
    return {
      node,
      x: 260 + Math.cos(angle) * radius,
      y: 220 + Math.sin(angle) * radius,
    };
  });

  return (
    <div style={{ minHeight: 500, overflow: 'auto' }}>
      <svg viewBox="0 0 520 440" width="100%" height="440" role="img" aria-label="Symbol dependency graph">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--border-strong)" />
          </marker>
        </defs>
        {points.map((point, index) => {
          const next = points[(index + 1) % points.length];
          return (
            <line
              key={`${point.node.id}-${next.node.id}`}
              x1={point.x}
              y1={point.y}
              x2={next.x}
              y2={next.y}
              stroke={index % 3 === 0 ? 'var(--change-breaking)' : 'var(--border-strong)'}
              strokeWidth={index % 3 === 0 ? 2 : 1}
              strokeDasharray={index % 5 === 0 ? '6 6' : undefined}
              markerEnd="url(#arrow)"
              opacity={0.72}
            />
          );
        })}
        {points.map((point) => {
          const size = 18 + Math.min(point.node.dependents, 12);
          return (
            <g
              key={point.node.id}
              role="button"
              tabIndex={0}
              onClick={() => onInspect(point.node)}
              style={{ cursor: 'pointer' }}
            >
              {point.node.breakingImpact && (
                <circle cx={point.x} cy={point.y} r={size + 9} fill="none" stroke="var(--change-breaking)" strokeWidth={2} opacity={0.65} className="live-pulse" />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={size}
                fill={point.node.recentlyChanged ? 'var(--change-breaking)' : 'var(--surface-sunken)'}
                stroke={point.node.intent ? `var(--intent-${point.node.intent})` : 'var(--color-accent)'}
                strokeWidth={point.node.claimedBy ? 4 : 2}
              />
              <text x={point.x} y={point.y + size + 18} textAnchor="middle" fill="var(--content-primary)" fontSize="11" fontFamily="var(--font-mono)">
                {point.node.symbolName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function NodeDetails({ node }: { node: ImpactGraphNode }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p><strong>Symbol:</strong> <SymbolName value={node.symbolName} /></p>
      <p><strong>File:</strong> <FilePath value={node.filePath} /></p>
      <p><strong>Kind:</strong> {node.symbolKind}</p>
      <p><strong>Transitive dependents:</strong> {node.dependents}</p>
      {node.claimedBy && (
        <p><strong>Claim:</strong> <AgentId value={node.claimedBy} /> {node.intent && <IntentChip intent={node.intent} />}</p>
      )}
      {node.breakingImpact && <p style={{ color: 'var(--change-breaking)' }}>Breaking-change blast radius is active for this node.</p>}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span><span className="chip intent-write">write ring</span></span>
      <span><span className="chip intent-refactor">refactor ring</span></span>
      <span><span className="chip change-breaking">breaking halo</span></span>
      <span className="muted">Dashed edges represent unresolved imports.</span>
    </div>
  );
}
