import { beforeEach, describe, expect, it } from 'vitest';
import { ChairLogDB } from '../../src/db/db';
import {
  deleteVisit,
  eraseAllData,
  exportBackup,
  getCatalogs,
  loadSampleData,
  removeSampleData,
  restoreBackup,
  saveVisit,
  upsertProduct,
  ValidationError,
} from '../../src/db/repo';
import { parseBackup, previewBackup } from '../../src/domain/backup';
import { computeMetrics, filterRange } from '../../src/domain/metrics';
import { monthRange } from '../../src/domain/dates';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';

let d: ChairLogDB;
let n = 0;
beforeEach(async () => {
  d = new ChairLogDB(`test-${++n}`);
  await d.open();
});

const kpis = async () => {
  const visits = await d.visits.toArray();
  return computeMetrics(filterRange(visits, monthRange('2026-09')), await getCatalogs(d));
};

describe('database', () => {
  it('seeds catalogs and settings on first open', async () => {
    const c = await getCatalogs(d);
    expect(c.products).toHaveLength(11);
    expect(c.areas).toHaveLength(8);
    expect(c.retail).toHaveLength(5);
    expect((await d.settings.get('settings'))?.rollingRetentionMonths).toBe(6);
  });

  it('recomputes gross on save and rejects invalid visits', async () => {
    const v = await saveVisit({ ...SEPTEMBER_VISITS[0]!, serviceGrossCents: 1 }, d);
    expect(v.serviceGrossCents).toBe(46_800);
    await expect(saveVisit({ ...SEPTEMBER_VISITS[0]!, clientId: 'JOHN-01' }, d)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('price snapshot: changing Botox to $14 does not change saved visits (acceptance 6)', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, d);
    const botox = (await getCatalogs(d)).products.find((p) => p.id === 'botox')!;
    await upsertProduct({ ...botox, defaultUnitPriceCents: 1400 }, d);
    const saved = (await d.visits.get(SEPTEMBER_VISITS[0]!.uid))!;
    expect(saved.serviceGrossCents).toBe(46_800);
    expect(saved.products[0]!.unitPriceCents).toBe(1300);
    // Editing it later also keeps the snapshot.
    expect((await saveVisit({ ...saved, rebooked: false }, d)).serviceGrossCents).toBe(46_800);
  });

  it('backup round-trip: export, erase, restore gives identical KPIs (acceptance 7)', async () => {
    for (const v of SEPTEMBER_VISITS) await saveVisit(v, d);
    const before = await kpis();
    const json = JSON.stringify(await exportBackup(d));

    await eraseAllData(d);
    expect(await d.visits.count()).toBe(0);

    const parsed = parseBackup(json, 1);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(previewBackup(parsed.backup)).toMatchObject({
      visits: 10,
      firstMonth: '2026-09',
      lastMonth: '2026-09',
    });
    await restoreBackup(parsed.backup, 'replace', d);
    expect(await d.visits.count()).toBe(10);
    expect(await kpis()).toEqual(before);
  });

  it('merge dedupes by uid', async () => {
    for (const v of SEPTEMBER_VISITS.slice(0, 5)) await saveVisit(v, d);
    const parsed = parseBackup(JSON.stringify(await exportBackup(d)), 1);
    if (!parsed.ok) throw new Error(parsed.error);
    for (const v of SEPTEMBER_VISITS.slice(5)) await saveVisit(v, d);
    expect(await restoreBackup(parsed.backup, 'merge', d)).toBe(10);
  });

  it('rejects damaged backups', () => {
    expect(parseBackup('nope', 1)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: 'other' }), 1)).toMatchObject({ ok: false });
    const bad = {
      app: 'chair-log',
      schemaVersion: 1,
      visits: [{ ...SEPTEMBER_VISITS[0], clientId: 'Jane Doe' }],
      catalogs: { products: [], areas: [], retail: [] },
    };
    expect(parseBackup(JSON.stringify(bad), 1)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ ...bad, schemaVersion: 99 }), 1)).toMatchObject({ ok: false });
  });

  it('loads and removes sample data without touching real visits', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, d);
    const count = await loadSampleData(d);
    expect(count).toBeGreaterThan(80);
    const all = await d.visits.toArray();
    expect(all.filter((v) => v.isSample)).toHaveLength(count);
    await removeSampleData(d);
    expect(await d.visits.count()).toBe(1);
  });

  it('deletes a visit', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, d);
    await deleteVisit(SEPTEMBER_VISITS[0]!.uid, d);
    expect(await d.visits.count()).toBe(0);
  });
});
