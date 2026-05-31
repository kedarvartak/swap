import { AgentId, Card, ChangeTypeChip, FilePath, KpiTile, SymbolName, formatAge, formatTimestamp } from '../components/Primitives';
import type { ChangeType, SemanticDiff } from '../types/swap';
import type { ViewProps } from './types';
import { drawer } from './types';

export function ActivityView({ state, metrics, onInspect, setActiveView }: ViewProps) {
  const breakingDiffs = state.diffs.filter((diff) => diff.stats.breaking > 0);
  const changedSymbols = state.diffs.reduce((sum, diff) => sum + diff.changes.length, 0);

  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Activity</h1>
          <p className="view-subtitle">Semantic diffs and live coordination events with change type encoded by meaning, not decoration.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Recent diffs" value={state.diffs.length} />
        <KpiTile label="Changed symbols" value={changedSymbols} />
        <KpiTile label="Breaking diffs" value={breakingDiffs.length} tone={breakingDiffs.length > 0 ? 'change-breaking' : undefined} />
        <KpiTile label="Event stream" value={state.log.length} detail="buffered events" />
        <KpiTile label="Watched hits" value={metrics.breakingChangesLastHour} detail="last hour" />
        <KpiTile label="Throughput" value={metrics.throughputPerMinute.toFixed(1)} detail="edits/min" />
      </div>

      <div className="split-grid">
        <div style={{ display: 'grid', gap: 12 }}>
          {state.diffs.map((diff) => (
            <DiffCard
              key={diff.id}
              diff={diff}
              onOpen={() => onInspect(drawer(`Diff ${diff.id}`, <DiffDetails diff={diff} setActiveView={setActiveView} />))}
            />
          ))}
        </div>

        <Card>
          <h2 className="section-title">Live event stream</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {state.log.slice().reverse().map((event) => (
              <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '72px 70px 1fr', gap: 8, alignItems: 'baseline' }}>
                <span className="mono muted">{formatTimestamp(event.timestamp)}</span>
                <span className="mono">{event.agentShortId ?? 'system'}</span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DiffCard({ diff, onOpen }: { diff: SemanticDiff; onOpen: () => void }) {
  const hasBreaking = diff.stats.breaking > 0;
  return (
    <Card className="clickable" onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <AgentId value={diff.agentShortId} />
          <FilePath value={diff.filePath} />
        </div>
        <span className={`chip ${hasBreaking ? 'change-breaking' : 'change-modified'}`}>
          +{diff.stats.added} / ~{diff.stats.modified} / !{diff.stats.breaking}
        </span>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>{formatAge(diff.releasedAt)} ago</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {diff.changes.map((change) => (
          <div key={`${diff.id}-${change.symbolName}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <ChangeTypeChip type={change.changeType} />
            <SymbolName value={change.symbolName} />
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{change.summary}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DiffDetails({ diff, setActiveView }: { diff: SemanticDiff; setActiveView: ViewProps['setActiveView'] }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p><strong>Agent:</strong> <AgentId value={diff.agentShortId} /></p>
      <p><strong>File:</strong> <span className="mono">{diff.filePath}</span></p>
      {diff.changes.map((change) => (
        <div key={change.symbolName} className="card">
          <ChangeTypeChip type={change.changeType as ChangeType} />
          <p><SymbolName value={change.symbolName} /> <span className="muted">({change.symbolKind})</span></p>
          <p>{change.summary}</p>
        </div>
      ))}
      <button className="button button-primary" onClick={() => setActiveView('impact')}>Inspect in Impact Graph</button>
    </div>
  );
}
