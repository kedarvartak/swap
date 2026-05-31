import { useEffect, useMemo, useState } from 'react';
import type { Density, ThemeId } from '../theme/themes';

const THEME_KEY = 'swap.dashboard.theme';
const DENSITY_KEY = 'swap.dashboard.density';

function initialTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'graphite' || stored === 'daylight' || stored === 'contrast') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'graphite';
}

function initialDensity(): Density {
  const stored = localStorage.getItem(DENSITY_KEY);
  return stored === 'compact' ? 'compact' : 'comfortable';
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [density, setDensity] = useState<Density>(initialDensity);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  return useMemo(() => ({ theme, setTheme, density, setDensity }), [density, theme]);
}
