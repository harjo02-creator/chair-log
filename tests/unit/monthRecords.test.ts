import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { importCsv, rejectDuplicates, visitsToCsv } from '../../src/domain/csv';
import {
  emptyMonthRecord,
  importMonthCsv,
  monthRecordsToCsv,
  parseMonthCell,
  validateMonthRecord,
} from '../../src/domain/monthRecords';
import { monthPoint, monthSeries, missingMonths, visitKind } from '../../src/domain/monthly';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';

const C = DEFAULT_CATALOGS;
const NOW = '2026-10-17T12:00:00.000Z';
const TODAY = '2026-10-17';

// Same shape as the table she keeps by hand; numbers are made up.
const HAND_SHEET = `Month,Appointments Per Month,Botox,Filler,Combo Filler + Tox,Other,Days out Of Office,Models,Revenue
April,30,,,,,0,2,"$12,000.50"
May,50,,,,,2,3,"$15,000.00"
September,40,,,,,5,0,
`;

describe('parseMonthCell', () => {
  it('reads the formats people type', () => {
    expect(parseMonthCell('2026-04', null)).toBe('2026-04');
    expect(parseMonthCell('2026-4', null)).toBe('2026-04');
    expect(parseMonthCell('April 2026', null)).toBe('2026-04');
    expect(parseMonthCell('Apr, 2026', null)).toBe('2026-04');
    expect(parseMonthCell('4/2026', null)).toBe('2026-04');
    expect(parseMonthCell('April', 2026)).toBe('2026-04');
  });
  it('rejects nonsense', () => {
    expect(parseMonthCell('April', null)).toBeNull();
    expect(parseMonthCell('Smarch 2026', null)).toBeNull();
    expect(parseMonthCell('2026-13', null)).toBeNull();
  });
});

describe('importMonthCsv', () => {
  it('imports her hand-kept sheet, keeping blanks as blanks', () => {
    const r = importMonthCsv(HAND_SHEET, { now: NOW, today: TODAY });
    expect(r.headerError).toBeNull();
    expect(r.okCount).toBe(3);
    const [apr, , sep] = r.rows.map((x) => x.record!);
    expect(apr).toMatchObject({
      month: '2026-04',
      appointments: 30,
      daysOut: 0,
      models: 2,
      serviceCents: 1_200_050,
    });
    expect(apr!.botox).toBeNull();
    expect(apr!.newClients).toBeNull();
    expect(sep).toMatchObject({ month: '2026-09', appointments: 40, daysOut: 5, serviceCents: null });
  });

  it('puts a bare month name in the most recent year, never the future', () => {
    const r = importMonthCsv('Month,Appointments\nDecember,10\n', { now: NOW, today: TODAY });
    expect(r.rows[0]!.record!.month).toBe('2025-12');
  });

  it('reports bad cells, duplicates and impossible numbers by line', () => {
    const r = importMonthCsv(
      'Month,Appointments,New clients,Returning clients,Revenue,Days out\n2026-04,ten,,,,\n2026-05,5,4,3,,\n2026-06,5,,,abc,\n2026-06,5,,,,\n2026-07,5,,,,40\n',
      { now: NOW, today: TODAY },
    );
    expect(r.okCount).toBe(0);
    const errs = Object.fromEntries(r.rows.map((x) => [x.line, x.errors[0] ?? '']));
    expect(errs[2]).toMatch(/whole number/);
    expect(errs[3]).toMatch(/can’t be more than appointments/);
    expect(errs[4]).toMatch(/dollar amount/);
    expect(errs[5]).toMatch(/twice/);
    expect(errs[6]).toMatch(/more than 31/);
  });

  it('needs a Month column and at least one other known column', () => {
    expect(importMonthCsv('Appointments\n5\n', { now: NOW, today: TODAY }).headerError).toMatch(/Month/);
    expect(importMonthCsv('Month,Foo\n2026-04,5\n', { now: NOW, today: TODAY }).headerError).toMatch(
      /No known columns/,
    );
  });

  it('round-trips through its own export', () => {
    const r = importMonthCsv(HAND_SHEET, { now: NOW, today: TODAY });
    const recs = r.rows.map((x) => x.record!);
    const again = importMonthCsv(monthRecordsToCsv(recs), { now: NOW, today: TODAY });
    expect(again.rows.map((x) => x.record)).toEqual(recs);
  });
});

describe('validateMonthRecord', () => {
  it('accepts an empty month and rejects negatives', () => {
    expect(validateMonthRecord(emptyMonthRecord('2026-04', NOW))).toEqual([]);
    expect(validateMonthRecord({ ...emptyMonthRecord('2026-04', NOW), models: -1 })).toHaveLength(1);
  });
});

describe('monthPoint', () => {
  const recs = importMonthCsv(HAND_SHEET, { now: NOW, today: TODAY }).rows.map((x) => x.record!);
  const sepRecord = { ...emptyMonthRecord('2026-09', NOW), daysOut: 3, models: 1 };

  it('uses logged visits when a month has them, and days out from the monthly record', () => {
    const p = monthPoint('2026-09', SEPTEMBER_VISITS, [sepRecord], C);
    expect(p.source).toBe('visits');
    expect(p.appointments).toBe(SEPTEMBER_VISITS.filter((v) => v.date.startsWith('2026-09')).length);
    expect(p.daysOut).toBe(3);
    expect(p.models).toBe(1);
    expect(p.rebookRate).not.toBeNull();
    expect((p.tox ?? 0) + (p.filler ?? 0) + (p.combo ?? 0) + (p.other ?? 0)).toBe(p.appointments);
  });

  it('merges visits into a larger monthly total: her count wins, billing scales to it', () => {
    const rec = { ...emptyMonthRecord('2026-09', NOW), appointments: 20, daysOut: 2 };
    const p = monthPoint('2026-09', SEPTEMBER_VISITS, [rec], C);
    // 10 hand-checked visits, $8,516 service + $358 retail, inside her 20.
    expect(p).toMatchObject({ source: 'estimate', loggedVisits: 10, appointments: 20, daysOut: 2 });
    expect(p.serviceCents).toBe(1_703_200);
    expect(p.retailCents).toBe(71_600);
    expect(p.grossCents).toBe(1_774_800);
    expect(p.rebookRate).toBe(0.7);
  });

  it('keeps revenue she entered when merging', () => {
    const rec = { ...emptyMonthRecord('2026-09', NOW), appointments: 20, serviceCents: 1_000_000 };
    expect(monthPoint('2026-09', SEPTEMBER_VISITS, [rec], C).serviceCents).toBe(1_000_000);
  });

  it('uses the visits when they cover at least her monthly count', () => {
    const rec = { ...emptyMonthRecord('2026-09', NOW), appointments: 8 };
    expect(monthPoint('2026-09', SEPTEMBER_VISITS, [rec], C)).toMatchObject({
      source: 'visits',
      appointments: 10,
    });
  });

  it('falls back to the monthly record as an estimate', () => {
    const p = monthPoint('2026-04', [], recs, C);
    expect(p).toMatchObject({
      source: 'estimate',
      appointments: 30,
      serviceCents: 1_200_050,
      grossCents: 1_200_050,
    });
    expect(p.rebookRate).toBeNull();
  });

  it('marks months with nothing as none and lists missing fields', () => {
    const pts = monthSeries('2026-09', 6, [], recs, C);
    expect(pts.map((p) => p.source)).toEqual(['estimate', 'estimate', 'none', 'none', 'none', 'estimate']);
    expect(missingMonths(pts, ['serviceCents'])).toEqual(['Sep 2026']);
  });
});

describe('visitKind', () => {
  it('calls tox plus filler in one visit a combo', () => {
    const v = SEPTEMBER_VISITS.find((x) => x.products.length === 1 && x.area.includes('tox'))!;
    expect(visitKind(v, C)).toBe('tox');
    const filler = {
      productId: 'rha-4',
      nameSnapshot: 'RHA 4',
      unit: 'mL' as const,
      qty: 1,
      unitPriceCents: 80_000,
    };
    expect(visitKind({ ...v, products: [...v.products, filler] }, C)).toBe('combo');
  });
});

describe('rejectDuplicates', () => {
  it('rejects rows already in the log and repeats within the file', () => {
    const csv = visitsToCsv(SEPTEMBER_VISITS.slice(0, 3), C);
    let id = 0;
    const doubled = csv + csv.split('\r\n').slice(1).join('\r\n');
    const report = importCsv(doubled, C, { now: NOW, newId: () => `n${++id}` });
    expect(report.okCount).toBe(6);
    const vsLog = rejectDuplicates(report, SEPTEMBER_VISITS.slice(0, 1));
    expect(vsLog.okCount).toBe(2);
    expect(vsLog.rows.filter((r) => !r.ok).every((r) => /Already in the log/.test(r.errors[0]!))).toBe(true);
  });
});
