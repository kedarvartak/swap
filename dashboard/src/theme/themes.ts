export type ThemeId = 'graphite' | 'daylight' | 'contrast';
export type Density = 'comfortable' | 'compact';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const themes: ThemeOption[] = [
  { id: 'graphite', label: 'Graphite', description: 'Dark control-plane default' },
  { id: 'daylight', label: 'Daylight', description: 'Light demo and daytime mode' },
  { id: 'contrast', label: 'Contrast', description: 'High-contrast accessibility mode' },
];

export const densities: Array<{ id: Density; label: string; description: string }> = [
  { id: 'comfortable', label: 'Comfortable', description: 'Roomier rows and cards' },
  { id: 'compact', label: 'Compact', description: 'Tighter density for large fleets' },
];
