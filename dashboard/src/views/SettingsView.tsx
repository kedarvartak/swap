import { Button, Card, KpiTile } from '../components/Primitives';
import type { Density, ThemeId } from '../theme/themes';
import { densities, themes } from '../theme/themes';
import type { ViewProps } from './types';

interface SettingsViewProps extends ViewProps {
  mode: 'live' | 'mock';
  setMode: (mode: 'live' | 'mock') => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

export function SettingsView({
  state,
  metrics,
  mode,
  setMode,
  theme,
  setTheme,
  density,
  setDensity,
}: SettingsViewProps) {
  return (
    <div className="view-scroll">
      <div className="view-header">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-subtitle">Connection mode, theme, density, and local watch preferences.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <KpiTile label="Connection" value={mode === 'live' ? 'Live' : 'Mock'} />
        <KpiTile label="Theme" value={themes.find((option) => option.id === theme)?.label ?? theme} />
        <KpiTile label="Density" value={density} />
        <KpiTile label="Watched symbols" value="3" />
        <KpiTile label="Claim p95" value={metrics.claimLatencyP95 === null ? 'n/a' : `${metrics.claimLatencyP95}ms`} />
        <KpiTile label="Agents" value={state.agents.length} />
      </div>

      <div className="split-grid">
        <Card>
          <h2 className="section-title">Connection</h2>
          <p className="muted">Switch between the local SWAP server and simulator data. The server URL is currently fixed to the local development endpoint.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant={mode === 'live' ? 'primary' : 'secondary'} onClick={() => setMode('live')}>Live</Button>
            <Button variant={mode === 'mock' ? 'primary' : 'secondary'} onClick={() => setMode('mock')}>Mock</Button>
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Theme</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {themes.map((option) => (
              <label key={option.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="theme" checked={theme === option.id} onChange={() => setTheme(option.id)} />
                <span>
                  <strong>{option.label}</strong>
                  <span className="muted" style={{ display: 'block' }}>{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Density</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {densities.map((option) => (
              <label key={option.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="density" checked={density === option.id} onChange={() => setDensity(option.id)} />
                <span>
                  <strong>{option.label}</strong>
                  <span className="muted" style={{ display: 'block' }}>{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
