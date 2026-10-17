/** All database reads and writes. Every multi-record write runs in one Dexie transaction (NFR-5). */
import { db, defaultSettings, SCHEMA_VERSION, type ChairLogDB, type SyncTable } from './db';
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

/**
 * Records a deletion so the shared log hears about it on the next sync. Harmless when not syncing:
 * tombstones are tiny and cleared once pushed or when the device is erased.
 */
async function tombstone(d: ChairLogDB, table: SyncTable, ids: string[]) {
  const deletedAt = nowISO();
  await d.tombstones.bulkPut(ids.map((id) => ({ key: `${table}:${id}`, table, id, deletedAt })));
}

/** A record saved again after being deleted is alive; drop its tombstone. */
async function revive(d: ChairLogDB, table: SyncTable, id: string) {
  await d.tombstones.delete(`${table}:${id}`);
}

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
  await d.transaction('rw', d.visits, d.tombstones, async () => {
    await d.visits.put(v);
    await revive(d, 'visits', v.uid);
  });
  return v;
}

export async function deleteVisit(uid: string, d: ChairLogDB = db): Promise<void> {
  await d.transaction('rw', d.visits, d.tombstones, async () => {
    const v = await d.visits.get(uid);
    await d.visits.delete(uid);
    // Sample visits never leave the device, so there's nothing to tell the shared log.
    if (v && !v.isSample) await tombstone(d, 'visits', [uid]);
  });
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
  await d.products.put({ ...p, updatedAt: nowISO() });
}
export async function upsertArea(a: TreatmentArea, d: ChairLogDB = db) {
  await d.areas.put({ ...a, updatedAt: nowISO() });
}
export async function upsertRetail(r: RetailItem, d: ChairLogDB = db) {
  await d.retail.put({ ...r, updatedAt: nowISO() });
}

/**
 * Puts the default price and treatment lists back. With `share` (the Settings button), the reset is
 * stamped so it reaches other devices, and custom items it drops are deleted there too.
 */
export async function resetCatalogs(d: ChairLogDB = db, share = true): Promise<void> {
  const now = nowISO();
  const stamp = <T extends object>(xs: T[]) => (share ? xs.map((x) => ({ ...x, updatedAt: now })) : xs);
  const custom = (ids: string[], defaults: { id: string }[]) =>
    ids.filter((id) => !defaults.some((x) => x.id === id));
  await d.transaction('rw', [d.products, d.areas, d.retail, d.tombstones], async () => {
    if (share) {
      const C = DEFAULT_CATALOGS;
      await tombstone(d, 'products', custom(await d.products.toCollection().primaryKeys(), C.products));
      await tombstone(d, 'areas', custom(await d.areas.toCollection().primaryKeys(), C.areas));
      await tombstone(d, 'retail', custom(await d.retail.toCollection().primaryKeys(), C.retail));
    }
    await Promise.all([d.products.clear(), d.areas.clear(), d.retail.clear()]);
    await d.products.bulkAdd(stamp(DEFAULT_CATALOGS.products));
    await d.areas.bulkAdd(stamp(DEFAULT_CATALOGS.areas));
    await d.retail.bulkAdd(stamp(DEFAULT_CATALOGS.retail));
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
    // Sync bookkeeping belongs to this device's shared log; a backup restored elsewhere starts fresh.
    const plain = <T extends { syncedAt?: string }>(xs: T[]) =>
      xs.map(({ syncedAt: _synced, ...x }) => x as T);
    return makeBackup(
      plain(visits),
      { products: plain(catalogs.products), areas: plain(catalogs.areas), retail: plain(catalogs.retail) },
      settings,
      nowISO(),
      SCHEMA_VERSION,
      { monthRecords: plain(monthRecords), goals: plain(goals) },
    );
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
  const tables = [d.visits, d.products, d.areas, d.retail, d.settings, d.monthRecords, d.goals, d.tombstones];
  return d.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      // Whatever the backup doesn't have is deleted, here and in the shared log.
      const gone = (have: string[], incoming: string[]) => have.filter((k) => !incoming.includes(k));
      const real = (await d.visits.toArray()).filter((v) => !v.isSample).map((v) => v.uid);
      await tombstone(
        d,
        'visits',
        gone(
          real,
          b.visits.map((v) => v.uid),
        ),
      );
      const months = await d.monthRecords.toCollection().primaryKeys();
      await tombstone(
        d,
        'monthRecords',
        gone(
          months,
          b.monthRecords.map((r) => r.month),
        ),
      );
      const goalKeys = await d.goals.toCollection().primaryKeys();
      await tombstone(
        d,
        'goals',
        gone(
          goalKeys,
          b.goals.map((g) => g.metric),
        ),
      );
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
  await d.transaction('rw', d.monthRecords, d.tombstones, async () => {
    const cur = await d.monthRecords.get(rec.month);
    await d.monthRecords.put({ ...rec, syncedAt: cur?.syncedAt });
    await revive(d, 'monthRecords', rec.month);
  });
  return rec;
}

export async function deleteMonthRecord(month: string, d: ChairLogDB = db): Promise<void> {
  await d.transaction('rw', d.monthRecords, d.tombstones, async () => {
    await d.monthRecords.delete(month);
    await tombstone(d, 'monthRecords', [month]);
  });
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
  await d.transaction('rw', d.monthRecords, d.tombstones, async () => {
    for (const r of records) {
      const cur = await d.monthRecords.get(r.month);
      const merged: MonthRecord = { ...r, updatedAt: nowISO(), syncedAt: cur?.syncedAt };
      if (cur && fillBlanks) for (const f of MONTH_FIELDS) merged[f.key] = r[f.key] ?? cur[f.key];
      await d.monthRecords.put(merged);
      await revive(d, 'monthRecords', r.month);
    }
  });
  return records.length;
}

export async function saveGoal(g: Goal, d: ChairLogDB = db): Promise<void> {
  if (!(g.target > 0)) throw new ValidationError(['A goal needs a target above 0.']);
  await d.transaction('rw', d.goals, d.tombstones, async () => {
    const cur = await d.goals.get(g.metric);
    if (cur?.target === g.target) return; // unchanged; don't mark it for sync
    await d.goals.put({ ...g, updatedAt: nowISO(), syncedAt: cur?.syncedAt });
    await revive(d, 'goals', g.metric);
  });
}

export async function deleteGoal(metric: Goal['metric'], d: ChairLogDB = db): Promise<void> {
  await d.transaction('rw', d.goals, d.tombstones, async () => {
    await d.goals.delete(metric);
    await tombstone(d, 'goals', [metric]);
  });
}

/**
 * Deletes every visit, catalog change, draft and setting on this device, then re-seeds defaults.
 * The shared log is untouched: after signing in again the device pulls everything back.
 */
export async function eraseAllData(d: ChairLogDB = db): Promise<void> {
  const tables = [
    d.visits,
    d.products,
    d.areas,
    d.retail,
    d.settings,
    d.drafts,
    d.monthRecords,
    d.goals,
    d.tombstones,
    d.syncState,
  ];
  await d.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await d.settings.add(defaultSettings());
  });
  await resetCatalogs(d, false);
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
