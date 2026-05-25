import { useState, useEffect, type CSSProperties } from 'react';
import type { DashboardState } from './types/swap';
import { buildInitialState } from './data/mockData';
import { tick } from './data/simulator';
import { colors, fonts } from './styles/tokens';

import { Header } from './components/Header';
import { AgentsPanel } from './components/AgentsPanel';
import { ClaimsPanel } from './components/ClaimsPanel';
import { NegotiationsPanel } from './components/NegotiationsPanel';
import { DependencyGraphPanel } from './components/DependencyGraphPanel';
import { SemanticDiffsPanel } from './components/SemanticDiffsPanel';
import { ActivityLog } from './components/ActivityLog';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    background: colors.bg,
    fontFamily: fonts.mono,
    overflow: 'hidden',
  } as CSSProperties,

  grid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: 1,
    background: colors.border,
    overflow: 'hidden',
  } as CSSProperties,

  // Activity log spans the full bottom row
  logWrapper: {
    gridColumn: '1 / -1',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  } as CSSProperties,
};

const TICK_INTERVAL_MS = 2000;

export function App() {
  const [state, setState] = useState<DashboardState>(buildInitialState);

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => tick(prev));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const activeNegotiations = state.negotiations.filter((n) => n.active).length;

  return (
    <div style={s.root}>
      <Header
        agentCount={state.agents.length}
        claimCount={state.claims.length}
        activeNegotiations={activeNegotiations}
        tick={state.tick}
      />

      {/* 3-column top section */}
      <div style={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 1,
        background: colors.border,
        height: 'calc(55vh - 52px)',
      }}>
        <AgentsPanel agents={state.agents} />
        <ClaimsPanel claims={state.claims} />
        <NegotiationsPanel negotiations={state.negotiations} />
      </div>

      {/* 3-column bottom section */}
      <div style={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 1,
        background: colors.border,
        height: '30vh',
      }}>
        <DependencyGraphPanel edges={state.edges} />
        <SemanticDiffsPanel diffs={state.diffs} />
        <ActivityLog events={state.log} />
      </div>
    </div>
  );
}
