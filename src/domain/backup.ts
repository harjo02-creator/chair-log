/** JSON backup and restore (DATA-2, DATA-3). Pure: parsing, validation, preview and merge. */
import { CATEGORIES, UNITS, type Catalogs, type Settings, type Visit, type YearMonth } from './types';
import { validateVisit } from './validation';
import { monthOf } from './dates';
import { GOAL_META, type Goal } from './insights';
import { emptyMonthRecord, validateMonthRecord, type MonthRecord } from './monthRecords';

export const BACKUP_APP_ID = 'chair-log';

/** Settings that travel with a backup. The PIN and device-specific flags stay on the device. */
export type BackupSettings = Pick<Settings, 'rollingRetentionMonths' | 'theme'>;

export interface Backup {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  visits: Visit[];
  catalogs: Catalogs;
  settings: BackupSettings;
  /** Added in schema v2; empty when restoring an older backup. */
  monthRecords: MonthRecord[];
  goals: Goal[];
}

export function makeBackup(
  visits: Visit[],
  catalogs: Catalogs,
  settings: Settings,
  exportedAt: string,
  schemaVersion: number,
  extra: { monthRecords: MonthRecord[]; goals: Goal[] } = { monthRecords: [], goals: [] },
): Backup {
  return {
    app: BACKUP_APP_ID,
    schemaVersion,
    exportedAt,
    visits,
    catalogs,
    settings: { rollingRetentionMonths: settings.rollingRetentionMonths, theme: settings.theme },
    monthRecords: extra.monthRecords,
    goals: extra.goals,
  };
}

export const backupFilename = (isoDate: string) => `aurelle-backup-${isoDate}.json`;

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Validates structure and every visit. Rejects the whole file if any visit is invalid. */
export function parseBackup(text: string, currentSchemaVersion: number): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON. Choose an Aurelle backup file." };
  }
  if (!isObj(data) || data.app !== BACKUP_APP_ID)
    return { ok: false, error: "This isn't an Aurelle backup file." };
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > currentSchemaVersion)
    return { ok: false, error: 'This backup is from a newer version of Aurelle. Update the app first.' };
  if (!Array.isArray(data.visits)) return { ok: false, error: 'The backup has no visits list.' };
  const c = data.catalogs;
  if (!isObj(c) || !Array.isArray(c.products) || !Array.isArray(c.areas) || !Array.isArray(c.retail))
    return { ok: false, error: 'The backup is missing its product and treatment lists.' };

  for (const p of c.products as unknown[])
    if (
      !isObj(p) ||
      typeof p.id !== 'string' ||
      typeof p.name !== 'string' ||
      !UNITS.includes(p.unit as never) ||
      !CATEGORIES.includes(p.category as never) ||
      !Number.isInteger(p.defaultUnitPriceCents)
    )
      return { ok: false, error: 'A product in the backup is damaged.' };
  for (const a of c.areas as unknown[])
    if (
      !isObj(a) ||
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      !CATEGORIES.includes(a.category as never)
    )
      return { ok: false, error: 'A treatment area in the backup is damaged.' };
  for (const r of c.retail as unknown[])
    if (
      !isObj(r) ||
      typeof r.id !== 'string' ||
      typeof r.name !== 'string' ||
      !Number.isInteger(r.defaultPriceCents)
    )
      return { ok: false, error: 'A retail item in the backup is damaged.' };

  const uids = new Set<string>();
  for (let i = 0; i < data.visits.length; i++) {
    const v = data.visits[i] as Visit;
    const errs = isObj(v) ? validateVisit(v) : ['not an object'];
    if (errs.length) return { ok: false, error: `Visit ${i + 1} in the backup is invalid: ${errs[0]}` };
    if (uids.has(v.uid)) return { ok: false, error: `Visit ${i + 1} is duplicated in the backup.` };
    uids.add(v.uid);
  }

  const monthRecords: MonthRecord[] = [];
  if (data.monthRecords !== undefined && !Array.isArray(data.monthRecords))
    return { ok: false, error: 'The backup’s monthly totals are damaged.' };
  for (const r of (data.monthRecords ?? []) as unknown[]) {
    if (!isObj(r) || typeof r.month !== 'string')
      return { ok: false, error: 'A month in the backup is damaged.' };
    const rec = { ...emptyMonthRecord(r.month, ''), ...r } as MonthRecord;
    const errs = validateMonthRecord(rec);
    if (errs.length) return { ok: false, error: `${r.month} in the backup is invalid: ${errs[0]}` };
    monthRecords.push(rec);
  }
  const goals: Goal[] = [];
  if (data.goals !== undefined && !Array.isArray(data.goals))
    return { ok: false, error: 'The backup’s goals are damaged.' };
  for (const g of (data.goals ?? []) as unknown[]) {
    if (!isObj(g) || !(String(g.metric) in GOAL_META) || typeof g.target !== 'number' || !(g.target > 0))
      return { ok: false, error: 'A goal in the backup is damaged.' };
    goals.push(g as unknown as Goal);
  }

  const s = isObj(data.settings) ? data.settings : {};
  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      schemaVersion: data.schemaVersion,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      visits: data.visits as Visit[],
      catalogs: c as unknown as Catalogs,
      settings: {
        rollingRetentionMonths: typeof s.rollingRetentionMonths === 'number' ? s.rollingRetentionMonths : 6,
        theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
      },
      monthRecords,
      goals,
    },
  };
}

export interface BackupPreview {
  visits: number;
  sampleVisits: number;
  firstMonth: YearMonth | null;
  lastMonth: YearMonth | null;
  exportedAt: string;
}

export function previewBackup(b: Backup): BackupPreview {
  const dates = b.visits.map((v) => v.date).sort();
  return {
    visits: b.visits.length,
    sampleVisits: b.visits.filter((v) => v.isSample).length,
    firstMonth: dates.length ? monthOf(dates[0]!) : null,
    lastMonth: dates.length ? monthOf(dates[dates.length - 1]!) : null,
    exportedAt: b.exportedAt,
  };
}

/** Merge by uid; when both sides have a visit, the more recently updated one wins. */
export function mergeVisits(existing: readonly Visit[], incoming: readonly Visit[]): Visit[] {
  const map = new Map(existing.map((v) => [v.uid, v]));
  for (const v of incoming) {
    const cur = map.get(v.uid);
    if (!cur || v.updatedAt > cur.updatedAt) map.set(v.uid, v);
  }
  return [...map.values()];
}

/** Merge keyed records (months, goals); the more recently updated one wins. */
export function mergeByKey<T extends { updatedAt: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  key: (x: T) => string,
): T[] {
  const map = new Map(existing.map((x) => [key(x), x]));
  for (const x of incoming) {
    const cur = map.get(key(x));
    if (!cur || x.updatedAt > cur.updatedAt) map.set(key(x), x);
  }
  return [...map.values()];
}

/** Catalog merge keeps the device's items and adds ones it doesn't have. */
export function mergeCatalogs(existing: Catalogs, incoming: Catalogs): Catalogs {
  const add = <T extends { id: string }>(a: T[], b: T[]) => [
    ...a,
    ...b.filter((x) => !a.some((y) => y.id === x.id)),
  ];
  return {
    products: add(existing.products, incoming.products),
    areas: add(existing.areas, incoming.areas),
    retail: add(existing.retail, incoming.retail),
  };
}
