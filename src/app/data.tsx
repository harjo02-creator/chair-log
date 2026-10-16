import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, defaultSettings } from '../db/db';
import type { Catalogs, Settings, Visit } from '../domain/types';

export interface AppData {
  visits: Visit[];
  catalogs: Catalogs;
  settings: Settings;
}

const DataContext = createContext<AppData | null>(null);

/** Loads everything once and keeps it live. 5,000 visits is a few MB in memory (NFR-8). */
export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const visits = useLiveQuery(() => db.visits.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const areas = useLiveQuery(() => db.areas.toArray(), []);
  const retail = useLiveQuery(() => db.retail.toArray(), []);
  const settings = useLiveQuery(async () => (await db.settings.get('settings')) ?? defaultSettings(), []);

  const value = useMemo<AppData | null>(
    () =>
      visits && products && areas && retail && settings
        ? { visits, catalogs: { products, areas, retail }, settings }
        : null,
    [visits, products, areas, retail, settings],
  );
  if (!value) return <>{fallback}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): AppData {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
