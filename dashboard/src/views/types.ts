import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { DrawerContent } from '../app/AppShell';
import type { ViewId } from '../app/routes';
import type { DashboardMetrics } from '../hooks/useSelectors';
import type { DashboardState } from '../types/swap';

export interface ViewProps {
  state: DashboardState;
  metrics: DashboardMetrics;
  onInspect: Dispatch<SetStateAction<DrawerContent | null>>;
  setActiveView: (view: ViewId) => void;
}

export function drawer(title: string, body: ReactNode): DrawerContent {
  return { title, body };
}
