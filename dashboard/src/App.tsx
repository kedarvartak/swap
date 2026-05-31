import { useState } from 'react';
import { AppShell } from './app/AppShell';
import { useDashboardMetrics } from './hooks/useSelectors';
import { useSwapSocket } from './hooks/useSwapSocket';
import { useTheme } from './hooks/useTheme';
import './theme/semantic.css';

export function App() {
  const [mode, setMode] = useState<'live' | 'mock'>('live');
  const { theme, setTheme, density, setDensity } = useTheme();
  const { state, connectionStatus } = useSwapSocket(mode);
  const metrics = useDashboardMetrics(state);

  return (
    <AppShell
      state={state}
      metrics={metrics}
      connectionStatus={connectionStatus}
      mode={mode}
      setMode={setMode}
      theme={theme}
      setTheme={setTheme}
      density={density}
      setDensity={setDensity}
    />
  );
}
