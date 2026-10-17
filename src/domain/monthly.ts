/**
 * One row per month, combining logged visits with monthly totals. A month with logged visits uses
 * the visits; a month without uses its monthly record and is marked as an estimate. Days out and
 * models only exist on monthly records, so they always come from there.
 */
import { areaCategory } from './catalog';
import { addMonths, monthOf, monthRange } from './dates';
import { csvField } from './csv';
import { dollarsPlain, monthShort } from './format';
import { computeMetrics, filterRange } from './metrics';
import { MONTH_CSV_COLUMNS, type MonthRecord } from './monthRecords';
import type { Catalogs, Cents, Visit, YearMonth } from './types';

export type MonthSource = 'visits' | 'estimate' | 'none';

export interface MonthPoint {
  ym: YearMonth;
  label: string;
  source: MonthSource;
  appointments: number | null;
  newClients: number | null;
  returningClients: number | null;
  tox: number | null;
  filler: number | null;
  combo: number | null;
  other: number | null;
  serviceCents: Cents | null;
  retailCents: Cents | null;
  /** Service + retail; null when service revenue is unknown. */
  grossCents: Cents | null;
  /** Rebooked at checkout ÷ appointments. Visits only. */
  rebookRate: number | null;
  daysOut: number | null;
  models: number | null;
}

/** tox / filler / combo (tox and filler in one visit) / other, by the products on the visit. */
export function visitKind(v: Visit, catalogs: Catalogs): 'tox' | 'filler' | 'combo' | 'other' {
  const cats = new Set(
    v.products.map((l) => catalogs.products.find((p) => p.id === l.productId)?.category ?? null),
  );
  if (!cats.size || cats.has(null)) cats.add(areaCategory(catalogs, v.area) ?? null);
  const tox = cats.has('TOX');
  const filler = cats.has('FILLER');
  return tox && filler ? 'combo' : tox ? 'tox' : filler ? 'filler' : 'other';
}

export function monthPoint(
  ym: YearMonth,
  visits: readonly Visit[],
  records: readonly MonthRecord[],
  catalogs: Catalogs,
): MonthPoint {
  const V = filterRange(visits, monthRange(ym));
  const rec = records.find((r) => r.month === ym) ?? null;
  const base = { ym, label: monthShort(ym), daysOut: rec?.daysOut ?? null, models: rec?.models ?? null };

  if (V.length) {
    const m = computeMetrics(V, catalogs);
    const kinds = { tox: 0, filler: 0, combo: 0, other: 0 };
    for (const v of V) kinds[visitKind(v, catalogs)]++;
    return {
      ...base,
      source: 'visits',
      appointments: m.n,
      newClients: m.newClients,
      returningClients: m.returningClients,
      ...kinds,
      serviceCents: m.serviceCents,
      retailCents: m.retailCents,
      grossCents: m.grossCents,
      rebookRate: m.rebookRate,
    };
  }

  const hasNumbers =
    rec != null &&
    [rec.appointments, rec.newClients, rec.returningClients, rec.serviceCents, rec.retailCents].some(
      (x) => x != null,
    );
  return {
    ...base,
    source: hasNumbers ? 'estimate' : 'none',
    appointments: rec?.appointments ?? null,
    newClients: rec?.newClients ?? null,
    returningClients: rec?.returningClients ?? null,
    tox: rec?.botox ?? null,
    filler: rec?.filler ?? null,
    combo: rec?.combo ?? null,
    other: rec?.other ?? null,
    serviceCents: rec?.serviceCents ?? null,
    retailCents: rec?.retailCents ?? null,
    grossCents: rec?.serviceCents != null ? rec.serviceCents + (rec.retailCents ?? 0) : null,
    rebookRate: null,
  };
}

/** `months` whole months ending with `endYm`, oldest first. */
export function monthSeries(
  endYm: YearMonth,
  months: number,
  visits: readonly Visit[],
  records: readonly MonthRecord[],
  catalogs: Catalogs,
): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(monthPoint(addMonths(endYm, -i), visits, records, catalogs));
  return out;
}

/** Every month with visits or a monthly record, oldest first. */
export function dataMonths(visits: readonly Visit[], records: readonly MonthRecord[]): YearMonth[] {
  return [...new Set([...visits.map((v) => monthOf(v.date)), ...records.map((r) => r.month)])].sort();
}

/** The most recent month with any data, or null. */
export function latestDataMonth(visits: readonly Visit[], records: readonly MonthRecord[]): YearMonth | null {
  const all = dataMonths(visits, records);
  return all.length ? all[all.length - 1]! : null;
}

/** Sum of a numeric field over the months that have it; null when none do. */
export const sumOf = (pts: readonly MonthPoint[], k: keyof MonthPoint): number | null => {
  const vals = pts.map((p) => p[k]).filter((x): x is number => typeof x === 'number');
  return vals.length ? vals.reduce((s, n) => s + n, 0) : null;
};

/** Months (by label) where `keys` are missing, for "Data missing" notes. Months with no data at all are skipped. */
export function missingMonths(pts: readonly MonthPoint[], keys: readonly (keyof MonthPoint)[]): string[] {
  return pts.filter((p) => p.source !== 'none' && keys.some((k) => p[k] == null)).map((p) => p.label);
}

/**
 * Month-by-month CSV in the monthly-totals columns (so it re-imports), plus a Source column
 * saying whether each month came from logged visits or her estimates.
 */
export function pointsToCsv(points: readonly MonthPoint[]): string {
  const money = (c: number | null) => (c == null ? '' : dollarsPlain(c));
  const n = (x: number | null) => (x == null ? '' : String(x));
  const rows = points
    .filter((p) => p.source !== 'none')
    .map((p) => [
      p.ym,
      n(p.appointments),
      n(p.newClients),
      n(p.returningClients),
      n(p.tox),
      n(p.filler),
      n(p.combo),
      n(p.other),
      n(p.daysOut),
      n(p.models),
      money(p.serviceCents),
      money(p.retailCents),
      p.source === 'visits' ? 'Logged visits' : 'Estimate',
    ]);
  return (
    [[...MONTH_CSV_COLUMNS, 'Source'], ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
  );
}
