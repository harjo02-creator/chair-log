import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_CATALOGS } from '../domain/catalog';
import type { Goal } from '../domain/insights';
import type { MonthRecord } from '../domain/monthRecords';
import type { Product, RetailItem, Settings, TreatmentArea, Visit } from '../domain/types';

/** Bump together with a new `db.version(n)` block and its upgrade function. */
export const SCHEMA_VERSION = 3;

/** Tables shared through sync, by their local name. */
export type SyncTable = 'visits' | 'products' | 'areas' | 'retail' | 'monthRecords' | 'goals';

/** A record deleted on this device that the shared log hasn't heard about yet. */
export interface Tombstone {
  /** `${table}:${id}` */
  key: string;
  table: SyncTable;
  id: string;
  deletedAt: string;
}

/** Which shared log this device syncs with, and how far it has pulled each table. */
export interface SyncState {
  id: 'state';
  bookId: string;
  email: string;
  /** Server time of the newest row pulled, per table. */
  cursors: Partial<Record<SyncTable, string>>;
  lastSyncedAt: string | null;
}

/** In-progress Log form (LOG-15). Stored as an opaque JSON blob under id "visit-form". */
export interface DraftRecord {
  id: string;
  savedAt: string;
  data: unknown;
}

export class ChairLogDB extends Dexie {
  visits!: EntityTable<Visit, 'uid'>;
  products!: EntityTable<Product, 'id'>;
  areas!: EntityTable<TreatmentArea, 'id'>;
  retail!: EntityTable<RetailItem, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  drafts!: EntityTable<DraftRecord, 'id'>;
  monthRecords!: EntityTable<MonthRecord, 'month'>;
  goals!: EntityTable<Goal, 'metric'>;
  tombstones!: EntityTable<Tombstone, 'key'>;
  syncState!: EntityTable<SyncState, 'id'>;

  constructor(name = 'chair-log') {
    super(name);
    this.version(1).stores({
      visits: 'uid, date, clientId, [clientId+date], isSample',
      products: 'id',
      areas: 'id',
      retail: 'id',
      settings: 'id',
      drafts: 'id',
    });
    // v2: monthly totals and monthly goals. New tables only, so no upgrade function.
    this.version(2).stores({
      monthRecords: 'month',
      goals: 'metric',
    });
    // v3: sync bookkeeping. New tables only.
    this.version(3).stores({
      tombstones: 'key, table',
      syncState: 'id',
    });
    this.on('populate', (tx) => {
      tx.table('products').bulkAdd(DEFAULT_CATALOGS.products);
      tx.table('areas').bulkAdd(DEFAULT_CATALOGS.areas);
      tx.table('retail').bulkAdd(DEFAULT_CATALOGS.retail);
      tx.table('settings').add(defaultSettings());
    });
  }
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    onboardingDone: false,
    rollingRetentionMonths: 6,
    theme: 'system',
    lastBackupAt: null,
    schemaVersion: SCHEMA_VERSION,
    backupReminderSnoozedUntil: null,
    iosInstallHintDismissed: false,
    pin: null,
    autoLockMinutes: 5,
  };
}

export const db = new ChairLogDB();
