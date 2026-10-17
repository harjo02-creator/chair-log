/** All database reads and writes. Every multi-record write runs in one Dexie transaction (NFR-5). */
import { db, defaultSettings, SCHEMA_VERSION, type ChairLogDB } from './db';
import { makeSampleVisits } from './sample';
import { DEFAULT_CATALOGS } from '../domain/catalog';
import { makeBackup, mergeByKey, mergeCatalogs, mergeVisits, type Backup } from '../domain/backup';
import type { Goal } from '../domain/insights';
import { MONTH_FIELDS, validateMonthRecord, type MonthRecord } from '../domain/monthRecords';
import { serviceGrossCents, validateVisit } from '../domain/validation';
import { todayISO } from '../domain/dates';
import type { Catalogs, Product, RetailItem, Settings, TreatmentArea, Visit } from '../domain/types';

export const newId = () => crypto.randomUUID();
export const nowISO = () => new Date().toISOString();

export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors[0] ?? 'Invalid visit');
  }
}

export async function getSettings(d: ChairLogDB = db): Promise<Settings> {
  return (await d.settings.get('settings')) ?? defaultSettings();
}

export async function updateSettings(
  patch: Partial<Omit<Settings, 'id'>>,
  d: ChairLogDB = db,
): Promise<void> {
  await d.transaction('rw', d.settings, async () => {
    const cur = await getSettings(d);
    await d.settings.put({ ...cur, ...patch, id: 'settings' });
  });
}

export async function getCatalogs(d: ChairLogDB = db): Promise<Catalogs> {
  const [products, areas, retail] = await Promise.all([
    d.products.toArray(),
    d.areas.toArray(),
    d.retail.toArray(),
  ]);
  return { products, areas, retail };
}

/** Recomputes the ticket gross from the price snapshots, validates, then writes. */
export async function saveVisit(visit: Visit, d: ChairLogDB = db): Promise<Visit> {
  const v: Visit = {
    ...visit,
    serviceGrossCents: serviceGrossCents(visit.products),
    retailCents: visit.retailItem ? visit.retailCents : 0,
    rebookDays: visit.rebooked ? visit.rebookDays : null,
    updatedAt: nowISO(),
  };
  const errors = validateVisit(v);
  if (errors.length) throw new ValidationError(errors);
  await d.transaction('rw', d.visits, async () => {
    await d.visits.put(v);
  });
  return v;
}

export async function deleteVisit(uid: string, d: ChairLogDB = db): Promise<void> {
  await d.visits.delete(uid);
}

export async function loadSampleData(d: ChairLogDB = db): Promise<number> {
  const catalogs = await getCatalogs(d);
  const visits = makeSampleVisits(catalogs, todayISO(), { newId, now: nowISO() });
  await d.transaction('rw', d.visits, async () => {
    await d.visits.filter((v) => v.isSample).delete();
    await d.visits.bulkAdd(visits);
  });
  return visits.length;
}

/** Dexie indexes booleans poorly, so filter rather than query the isSample index. */
export async function removeSampleData(d: ChairLogDB = db): Promise<number> {
  return d.transaction('rw', d.visits, () => d.visits.filter((v) => v.isSample).delete());
}

export async function upsertProduct(p: Product, d: ChairLogDB = db) {
  await d.products.put(p);
}
export async function upsertArea(a: TreatmentArea, d: ChairLogDB = db) {
  await d.areas.put(a);
}
export async function upsertRetail(r: RetailItem, d: ChairLogDB = db) {
  await d.retail.put(r);
}

export async function resetCatalogs(d: ChairLogDB = db): Promise<void> {
  await d.transaction('rw', d.products, d.areas, d.retail, async () => {
    await Promise.all([d.products.clear(), d.areas.clear(), d.retail.clear()]);
    await d.products.bulkAdd(DEFAULT_CATALOGS.products);
    await d.areas.bulkAdd(DEFAULT_CATALOGS.areas);
    await d.retail.bulkAdd(DEFAULT_CATALOGS.retail);
  });
}

export async function exportBackup(d: ChairLogDB = db): Promise<Backup> {
  const tables = [d.visits, d.products, d.areas, d.retail, d.settings, d.monthRecords, d.goals];
  return d.transaction('r', tables, async () => {
    const [visits, catalogs, settings, monthRecords, goals] = await Promise.all([
      d.visits.toArray(),
      getCatalogs(d),
      getSettings(d),
      d.monthRecords.toArray(),
      d.goals.toArray(),
    ]);
    return makeBackup(visits, catalogs, settings, nowISO(), SCHEMA_VERSION, { monthRecords, goals });
  });
}

export async function markBackedUp(d: ChairLogDB = db) {
  await updateSettings({ lastBackupAt: nowISO(), backupReminderSnoozedUntil: null }, d);
}

export async function restoreBackup(
  b: Backup,
  mode: 'merge' | 'replace',
  d: ChairLogDB = db,
): Promise<number> {
  const tables = [d.visits, d.products, d.areas, d.retail, d.settings, d.monthRecords, d.goals];
  return d.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await Promise.all([
        d.visits.clear(),
        d.products.clear(),
        d.areas.clear(),
        d.retail.clear(),
        d.monthRecords.clear(),
        d.goals.clear(),
      ]);
      await d.visits.bulkAdd(b.visits);
      await d.monthRecords.bulkAdd(b.monthRecords);
      await d.goals.bulkAdd(b.goals);
      await d.products.bulkAdd(b.catalogs.products);
      await d.areas.bulkAdd(b.catalogs.areas);
      await d.retail.bulkAdd(b.catalogs.retail);
      await updateSettings({ ...b.settings, onboardingDone: true }, d);
    } else {
      const merged = mergeVisits(await d.visits.toArray(), b.visits);
      await d.visits.bulkPut(merged);
      const cat = mergeCatalogs(await getCatalogs(d), b.catalogs);
      await d.products.bulkPut(cat.products);
      await d.areas.bulkPut(cat.areas);
      await d.retail.bulkPut(cat.retail);
      await d.monthRecords.bulkPut(
        mergeByKey(await d.monthRecords.toArray(), b.monthRecords, (r) => r.month),
      );
      await d.goals.bulkPut(mergeByKey(await d.goals.toArray(), b.goals, (g) => g.metric));
    }
    return d.visits.count();
  });
}

export async function importVisits(visits: Visit[], d: ChairLogDB = db): Promise<number> {
  await d.transaction('rw', d.visits, () => d.visits.bulkAdd(visits));
  return visits.length;
}

/* ---------- monthly totals and goals ---------- */

export async function saveMonthRecord(r: MonthRecord, d: ChairLogDB = db): Promise<MonthRecord> {
  const rec = { ...r, updatedAt: nowISO() };
  const errors = validateMonthRecord(rec);
  if (errors.length) throw new ValidationError(errors);
  await d.monthRecords.put(rec);
  return rec;
}

export async function deleteMonthRecord(month: string, d: ChairLogDB = db): Promise<void> {
  await d.monthRecords.delete(month);
}

/**
 * Upserts imported months. With `fillBlanks`, a blank cell in the file keeps the month's existing
 * value instead of clearing it, so a file with only some columns can't wipe the others.
 */
export async function importMonthRecords(
  records: MonthRecord[],
  d: ChairLogDB = db,
  fillBlanks = true,
): Promise<number> {
  await d.transaction('rw', d.monthRecords, async () => {
    for (const r of records) {
      const cur = fillBlanks ? await d.monthRecords.get(r.month) : undefined;
      const merged: MonthRecord = { ...r, updatedAt: nowISO() };
      if (cur) for (const f of MONTH_FIELDS) merged[f.key] = r[f.key] ?? cur[f.key];
      await d.monthRecords.put(merged);
    }
  });
  return records.length;
}

export async function saveGoal(g: Goal, d: ChairLogDB = db): Promise<void> {
  if (!(g.target > 0)) throw new ValidationError(['A goal needs a target above 0.']);
  await d.goals.put({ ...g, updatedAt: nowISO() });
}

export async function deleteGoal(metric: Goal['metric'], d: ChairLogDB = db): Promise<void> {
  await d.goals.delete(metric);
}

/** Deletes every visit, catalog change, draft and setting, then re-seeds defaults. */
export async function eraseAllData(d: ChairLogDB = db): Promise<void> {
  const tables = [d.visits, d.products, d.areas, d.retail, d.settings, d.drafts, d.monthRecords, d.goals];
  await d.transaction('rw', tables, async () => {
    await Promise.all([
      d.visits.clear(),
      d.drafts.clear(),
      d.settings.clear(),
      d.monthRecords.clear(),
      d.goals.clear(),
    ]);
    await d.settings.add(defaultSettings());
  });
  await resetCatalogs(d);
}

/* ---------- draft (LOG-15) ---------- */

export const DRAFT_ID = 'visit-form';

export async function saveDraft(data: unknown, d: ChairLogDB = db) {
  await d.drafts.put({ id: DRAFT_ID, savedAt: nowISO(), data });
}
export async function loadDraft(d: ChairLogDB = db): Promise<unknown | null> {
  return (await d.drafts.get(DRAFT_ID))?.data ?? null;
}
export async function clearDraft(d: ChairLogDB = db) {
  await d.drafts.delete(DRAFT_ID);
}
