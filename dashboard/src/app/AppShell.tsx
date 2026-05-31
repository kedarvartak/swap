import { useMemo, useState, type ReactNode } from 'react';
import type { DashboardState } from '../types/swap';
import type { ConnectionStatus } from '../hooks/useSwapSocket';
import type { DashboardMetrics } from '../hooks/useSelectors';
import type { Density, ThemeId } from '../theme/themes';
import { themes } from '../theme/themes';
import { ActivityView } from '../views/ActivityView';
import { ApprovalsView } from '../views/ApprovalsView';
import { AuditView } from '../views/AuditView';
import { CoordinationView } from '../views/CoordinationView';
import { FleetView } from '../views/FleetView';
import { ImpactGraphView } from '../views/ImpactGraphView';
import { PolicyView } from '../views/PolicyView';
import { ReplayView } from '../views/ReplayView';
import { SettingsView } from '../views/SettingsView';
import { routes, type ViewId } from './routes';
import './app.css';

export interface DrawerContent {
  title: string;
  body: ReactNode;
}

interface AppShellProps {
  state: DashboardState;
  metrics: DashboardMetrics;
  connectionStatus: ConnectionStatus;
  mode: 'live' | 'mock';
  setMode: (mode: 'live' | 'mock') => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

export function AppShell({
  state,
  metrics,
  connectionStatus,
  mode,
  setMode,
  theme,
  setTheme,
  density,
  setDensity,
}: AppShellProps) {
  const [activeView, setActiveView] = useState<ViewId>('fleet');
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);
  const pendingApprovals = metrics.pendingApprovals;

  const view = useMemo(() => {
    const common = { state, metrics, onInspect: setDrawer, setActiveView };
    switch (activeView) {
      case 'fleet':
        return <FleetView {...common} />;
      case 'impact':
        return <ImpactGraphView {...common} />;
      case 'coordination':
        return <CoordinationView {...common} />;
      case 'activity':
        return <ActivityView {...common} />;
      case 'audit':
        return <AuditView {...common} />;
      case 'replay':
        return <ReplayView {...common} />;
      case 'policy':
        return <PolicyView {...common} />;
      case 'approvals':
        return <ApprovalsView {...common} />;
      case 'settings':
        return (
          <SettingsView
            {...common}
            mode={mode}
            setMode={setMode}
            theme={theme}
            setTheme={setTheme}
            density={density}
            setDensity={setDensity}
          />
        );
    }
  }, [activeView, density, metrics, mode, setDensity, setMode, setTheme, state, theme]);

  return (
    <div className="app-shell">
      <Topbar
        metrics={metrics}
        connectionStatus={connectionStatus}
        mode={mode}
        setMode={setMode}
        theme={theme}
        setTheme={setTheme}
        onSettings={() => setActiveView('settings')}
      />
      <div className="shell-body">
        <NavRail
          activeView={activeView}
          onSelect={(id) => {
            setActiveView(id);
            setDrawer(null);
          }}
          pendingApprovals={pendingApprovals}
        />
        <main className="main-region">
          {view}
          <DetailDrawer drawer={drawer} onClose={() => setDrawer(null)} />
        </main>
      </div>
      <StatusBar
        state={state}
        metrics={metrics}
        connectionStatus={connectionStatus}
        mode={mode}
      />
    </div>
  );
}

function Topbar({
  metrics,
  connectionStatus,
  mode,
  setMode,
  theme,
  setTheme,
  onSettings,
}: {
  metrics: DashboardMetrics;
  connectionStatus: ConnectionStatus;
  mode: 'live' | 'mock';
  setMode: (mode: 'live' | 'mock') => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  onSettings: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          <div className="brand-title">SWAP</div>
          <div className="brand-subtitle">Coordination control plane</div>
        </div>
      </div>
      <div className="topbar-center">
        <div className="workspace-pill">Workspace: local</div>
        <div className="fleet-pill" data-health={metrics.fleetHealth}>
          <span className="health-dot" />
          {healthLabel(metrics.fleetHealth)}
        </div>
      </div>
      <div className="topbar-right">
        <button className="mode-toggle" onClick={() => setMode(mode === 'live' ? 'mock' : 'live')}>
          <span className="connection-dot" data-status={connectionStatus} />
          {mode === 'live' ? 'Live' : 'Mock'}
        </button>
        <select className="topbar-action" value={theme} onChange={(event) => setTheme(event.target.value as ThemeId)} aria-label="Theme">
          {themes.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <button className="topbar-action" title="Command palette">Cmd K</button>
        <button className="topbar-action" onClick={onSettings}>Settings</button>
      </div>
    </header>
  );
}

function NavRail({
  activeView,
  pendingApprovals,
  onSelect,
}: {
  activeView: ViewId;
  pendingApprovals: number;
  onSelect: (id: ViewId) => void;
}) {
  const groups = ['Monitor', 'Govern', 'System'] as const;
  return (
    <nav className="nav-rail" aria-label="Dashboard navigation">
      {groups.map((group) => (
        <div key={group}>
          <div className="nav-group-title">{group}</div>
          {routes.filter((route) => route.group === group).map((route) => (
            <button
              key={route.id}
              className={`nav-item ${activeView === route.id ? 'active' : ''}`}
              onClick={() => onSelect(route.id)}
            >
              <span className="nav-short">{route.shortLabel}</span>
              <span className="nav-label">{route.label}</span>
              {route.id === 'approvals' && pendingApprovals > 0 && (
                <span className="nav-badge">{pendingApprovals}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function DetailDrawer({ drawer, onClose }: { drawer: DrawerContent | null; onClose: () => void }) {
  return (
    <aside className={`drawer ${drawer ? 'open' : ''}`} aria-hidden={!drawer}>
      <div className="drawer-header">
        <strong>{drawer?.title ?? 'Details'}</strong>
        <button className="button" onClick={onClose}>Close</button>
      </div>
      <div className="drawer-body">{drawer?.body}</div>
    </aside>
  );
}

function StatusBar({
  state,
  metrics,
  connectionStatus,
  mode,
}: {
  state: DashboardState;
  metrics: DashboardMetrics;
  connectionStatus: ConnectionStatus;
  mode: 'live' | 'mock';
}) {
  return (
    <footer className="statusbar">
      <span>
        ws://localhost:7700 · {connectionStatus} · {mode === 'mock' ? 'simulated stream' : 'live stream'}
      </span>
      <span>
        {state.agents.length} agents · {state.claims.length} claims · {metrics.openConflicts} conflicts · p95 claim {metrics.claimLatencyP95 ?? 'n/a'}ms
      </span>
    </footer>
  );
}

function healthLabel(health: DashboardMetrics['fleetHealth']): string {
  if (health === 'healthy') return 'Fleet healthy';
  if (health === 'attention') return 'Needs attention';
  return 'No live fleet';
}
