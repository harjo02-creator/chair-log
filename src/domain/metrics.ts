/**
 * All summary formulas (spec §7.2). Pure functions: visits + catalogs in, numbers out.
 * Ratios are 0..1 and are null when the denominator is 0, so the UI renders "—".
 */
import { areaCategory, areaName } from './catalog';
import {
  addMonths,
  daysBetween,
  inRange,
  monthEnd,
  monthOf,
  monthRange,
  monthsInRange,
  monthStart,
  parseISODate,
  weekStart,
  addDays,
  type DateRange,
} from './dates';
import { monthShort } from './format';
import {
  CATEGORIES,
  SOURCES,
  type Catalogs,
  type Category,
  type Cents,
  type ISODate,
  type Source,
  type Unit,
  type Visit,
  type YearMonth,
} from './types';

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export function filterRange(visits: readonly Visit[], range: DateRange): Visit[] {
  return visits.filter((v) => inRange(v.date, range));
}

export interface Retention {
  returning: number;
  unique: number;
  rate: number | null;
}

/** Distinct clients with any REPEAT visit ÷ distinct clients. */
export function retention(V: readonly Visit[]): Retention {
  const unique = new Set<string>();
  const returning = new Set<string>();
  for (const v of V) {
    unique.add(v.clientId);
    if (v.visitType === 'REPEAT') returning.add(v.clientId);
  }
  return { returning: returning.size, unique: unique.size, rate: ratio(returning.size, unique.size) };
}

export interface PeriodMetrics {
  n: number;
  serviceCents: Cents;
  retailCents: Cents;
  grossCents: Cents;
  chairDays: number;
  perDay: number | null;
  avgTicketCents: Cents | null;
  uniqueClients: number;
  returningClients: number;
  newClients: number;
  retention: number | null;
  rebookedCount: number;
  rebookRate: number | null;
  selfSourcedCount: number;
  referralCount: number;
  independentCount: number;
  independence: number | null;
  selfSourcedShare: number | null;
  referralShare: number | null;
  retailCount: number;
  retailConversion: number | null;
  toxRepeatCount: number;
  toxInWindowCount: number;
  toxCadence: number | null;
  avgToxUnits: number | null;
}

export const TOX_WINDOW = { min: 90, max: 120 } as const;

export function computeMetrics(V: readonly Visit[], catalogs: Catalogs): PeriodMetrics {
  const n = V.length;
  const serviceCents = V.reduce((s, v) => s + v.serviceGrossCents, 0);
  const retailCents = V.reduce((s, v) => s + v.retailCents, 0);
  const chairDays = new Set(V.map((v) => v.date)).size;
  const ret = retention(V);
  const rebookedCount = V.filter((v) => v.rebooked).length;
  const selfSourcedCount = V.filter((v) => v.source === 'SELF_SOURCED').length;
  const referralCount = V.filter((v) => v.source === 'REFERRAL').length;
  const independentCount = selfSourcedCount + referralCount;
  const retailCount = V.filter((v) => v.retailItem != null && v.retailItem !== '').length;
  const toxRepeat = V.filter(
    (v) => v.visitType === 'REPEAT' && v.intervalDays != null && areaCategory(catalogs, v.area) === 'TOX',
  );
  const toxInWindowCount = toxRepeat.filter(
    (v) => v.intervalDays! >= TOX_WINDOW.min && v.intervalDays! <= TOX_WINDOW.max,
  ).length;
  const toxLines = V.flatMap((v) => v.products).filter((l) => {
    const p = catalogs.products.find((x) => x.id === l.productId);
    return l.unit === 'u' && p?.category === 'TOX' && !p.excludeFromToxUnitAvg;
  });

  return {
    n,
    serviceCents,
    retailCents,
    grossCents: serviceCents + retailCents,
    chairDays,
    perDay: ratio(n, chairDays),
    avgTicketCents: n ? serviceCents / n : null,
    uniqueClients: ret.unique,
    returningClients: ret.returning,
    newClients: ret.unique - ret.returning,
    retention: ret.rate,
    rebookedCount,
    rebookRate: ratio(rebookedCount, n),
    selfSourcedCount,
    referralCount,
    independentCount,
    independence: ratio(independentCount, n),
    selfSourcedShare: ratio(selfSourcedCount, n),
    referralShare: ratio(referralCount, n),
    retailCount,
    retailConversion: ratio(retailCount, n),
    toxRepeatCount: toxRepeat.length,
    toxInWindowCount,
    toxCadence: ratio(toxInWindowCount, toxRepeat.length),
    avgToxUnits: toxLines.length ? toxLines.reduce((s, l) => s + l.qty, 0) / toxLines.length : null,
  };
}

/* ---------- benchmark chips ---------- */

export type ChipTone = 'good' | 'warn' | 'neutral';
export interface Chip {
  tone: ChipTone;
  icon: string;
  text: string;
}

export function retentionChip(rate: number | null): Chip | null {
  if (rate == null) return null;
  return rate >= 0.6
    ? { tone: 'good', icon: '✓', text: 'Above 60% benchmark' }
    : { tone: 'warn', icon: '▲', text: 'Below 60% benchmark' };
}

export function rebookChip(rate: number | null): Chip | null {
  if (rate == null) return null;
  return rate >= 0.6
    ? { tone: 'good', icon: '✓', text: 'Strong' }
    : { tone: 'warn', icon: '▲', text: 'Room to grow' };
}

export function independenceChip(rate: number | null): Chip | null {
  if (rate == null) return null;
  return rate >= 0.5
    ? { tone: 'good', icon: '✓', text: 'Clients seek her out' }
    : { tone: 'neutral', icon: '●', text: 'Mostly clinic-fed' };
}

/* ---------- average ticket by category (SUM-5) ---------- */

export const TICKET_BENCHMARKS: Record<Category, { lo: Cents; hi: Cents; label: string } | null> = {
  TOX: { lo: 35_000, hi: 50_000, label: '$350–$500' },
  FILLER: { lo: 70_000, hi: 120_000, label: '$700–$1,200+' },
  BIO: null,
};

export interface CategoryTicket {
  category: Category;
  visits: number;
  avgTicketCents: Cents | null;
  benchmark: string | null;
  chip: Chip | null;
}

export function categoryTickets(V: readonly Visit[], catalogs: Catalogs): CategoryTicket[] {
  return CATEGORIES.map((category) => {
    const vs = V.filter((v) => areaCategory(catalogs, v.area) === category);
    const avg = vs.length ? vs.reduce((s, v) => s + v.serviceGrossCents, 0) / vs.length : null;
    const b = TICKET_BENCHMARKS[category];
    let chip: Chip | null = null;
    if (b && avg != null)
      chip =
        avg > b.hi
          ? { tone: 'good', icon: '▲', text: 'Above' }
          : avg >= b.lo
            ? { tone: 'good', icon: '✓', text: 'In range' }
            : { tone: 'warn', icon: '▼', text: 'Below' };
    return { category, visits: vs.length, avgTicketCents: avg, benchmark: b?.label ?? null, chip };
  });
}

/* ---------- product usage (SUM-6) ---------- */

export interface ProductUsage {
  productId: string;
  name: string;
  unit: Unit;
  visits: number;
  totalQty: number;
  avgQtyPerVisit: number;
  grossCents: Cents;
}

export function productUsage(V: readonly Visit[]): ProductUsage[] {
  const map = new Map<string, ProductUsage & { seen: Set<string> }>();
  for (const v of V)
    for (const l of v.products) {
      let o = map.get(l.productId);
      if (!o) {
        o = {
          productId: l.productId,
          name: l.nameSnapshot,
          unit: l.unit,
          visits: 0,
          totalQty: 0,
          avgQtyPerVisit: 0,
          grossCents: 0,
          seen: new Set(),
        };
        map.set(l.productId, o);
      }
      if (!o.seen.has(v.uid)) {
        o.seen.add(v.uid);
        o.visits++;
      }
      o.totalQty += l.qty;
      o.grossCents += Math.round(l.qty * l.unitPriceCents);
    }
  return [...map.values()]
    .map(({ seen: _seen, ...o }) => ({
      ...o,
      totalQty: round1(o.totalQty),
      avgQtyPerVisit: round1(o.totalQty / o.visits),
    }))
    .sort((a, b) => b.grossCents - a.grossCents);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- time buckets (CH-1, CH-3) ---------- */

export interface Bucket {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
  serviceCents: Cents;
  retailCents: Cents;
  newCount: number;
  repeatCount: number;
}

const shortMonth = (d: ISODate) => parseISODate(d).toLocaleDateString('en-US', { month: 'short' });

/** "Sep 1–7", clipped to the range; "Sep 29–Oct 5" style only when a week spans two months inside the range. */
export function weekLabel(start: ISODate, end: ISODate): string {
  const s = parseISODate(start).getDate();
  const e = parseISODate(end).getDate();
  return monthOf(start) === monthOf(end)
    ? `${shortMonth(start)} ${s}–${e}`
    : `${shortMonth(start)} ${s}–${shortMonth(end)} ${e}`;
}

/**
 * Monday-start weeks clipped to the range when it spans up to ~9 weeks; calendar months otherwise
 * (YTD and long custom ranges). Every bucket in the range is returned, including empty ones.
 */
export function timeBuckets(V: readonly Visit[], range: DateRange): Bucket[] {
  const weekly = daysBetween(range.start, range.end) <= 62;
  const buckets: Bucket[] = [];
  if (weekly) {
    for (let ws = weekStart(range.start); ws <= range.end; ws = addDays(ws, 7)) {
      const start = ws < range.start ? range.start : ws;
      const we = addDays(ws, 6);
      const end = we > range.end ? range.end : we;
      buckets.push(emptyBucket(ws, weekLabel(start, end), start, end));
    }
  } else {
    for (const ym of monthsInRange(range)) {
      const start = monthStart(ym) < range.start ? range.start : monthStart(ym);
      const end = monthEnd(ym) > range.end ? range.end : monthEnd(ym);
      buckets.push(emptyBucket(ym, monthShort(ym), start, end));
    }
  }
  for (const v of V) {
    const b = buckets.find((x) => v.date >= x.start && v.date <= x.end);
    if (!b) continue;
    b.serviceCents += v.serviceGrossCents;
    b.retailCents += v.retailCents;
    if (v.visitType === 'REPEAT') b.repeatCount++;
    else b.newCount++;
  }
  return buckets;
}

function emptyBucket(key: string, label: string, start: ISODate, end: ISODate): Bucket {
  return { key, label, start, end, serviceCents: 0, retailCents: 0, newCount: 0, repeatCount: 0 };
}

/* ---------- sources, procedure mix, cadence (CH-2, CH-4, CH-5) ---------- */

export function sourceCounts(V: readonly Visit[]): { source: Source; count: number; share: number | null }[] {
  return SOURCES.map((source) => {
    const count = V.filter((v) => v.source === source).length;
    return { source, count, share: ratio(count, V.length) };
  });
}

export interface MixRow {
  area: string;
  name: string;
  serviceCents: Cents;
  visits: number;
}

export function procedureMix(V: readonly Visit[], catalogs: Catalogs): MixRow[] {
  const map = new Map<string, MixRow>();
  for (const v of V) {
    const o = map.get(v.area) ?? {
      area: v.area,
      name: areaName(catalogs, v.area),
      serviceCents: 0,
      visits: 0,
    };
    o.serviceCents += v.serviceGrossCents;
    o.visits++;
    map.set(v.area, o);
  }
  return [...map.values()].sort((a, b) => b.serviceCents - a.serviceCents || a.name.localeCompare(b.name));
}

export const CADENCE_BUCKETS = [
  { label: '<75', min: 0, max: 74 },
  { label: '75–89', min: 75, max: 89 },
  { label: '90–104', min: 90, max: 104 },
  { label: '105–120', min: 105, max: 120 },
  { label: '121–150', min: 121, max: 150 },
  { label: '>150', min: 151, max: Number.POSITIVE_INFINITY },
] as const;

export function toxCadenceBuckets(
  V: readonly Visit[],
  catalogs: Catalogs,
): { label: string; count: number; inWindow: boolean }[] {
  const ivs = V.filter(
    (v) => v.visitType === 'REPEAT' && v.intervalDays != null && areaCategory(catalogs, v.area) === 'TOX',
  ).map((v) => v.intervalDays!);
  return CADENCE_BUCKETS.map((b) => ({
    label: b.label,
    count: ivs.filter((d) => d >= b.min && d <= b.max).length,
    inWindow: b.min >= TOX_WINDOW.min && b.max <= TOX_WINDOW.max,
  }));
}

/* ---------- months, defaults, trend (SUM-1, SUM-10, CH-6) ---------- */

/** Every month that has visits, newest first. */
export function monthsWithVisits(visits: readonly Visit[]): YearMonth[] {
  return [...new Set(visits.map((v) => monthOf(v.date)))].sort().reverse();
}

/** Most recent complete month with data; falls back to the current month. */
export function defaultMonth(months: readonly YearMonth[], today: ISODate): YearMonth {
  const current = monthOf(today);
  return months.find((m) => m < current) ?? current;
}

export interface TrendPoint {
  ym: YearMonth;
  label: string;
  grossCents: Cents;
  appointments: number;
}

export function monthlyTrend(visits: readonly Visit[], endYm: YearMonth, months = 6): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonths(endYm, -i);
    const V = filterRange(visits, monthRange(ym));
    out.push({
      ym,
      label: monthShort(ym),
      grossCents: V.reduce((s, v) => s + v.serviceGrossCents + v.retailCents, 0),
      appointments: V.length,
    });
  }
  return out;
}

export interface Delta {
  dir: 'up' | 'down' | 'flat';
  text: string;
}

/** Month-over-month change. `kind` decides whether the change is shown in % points or relative %. */
export function delta(cur: number | null, prev: number | null, kind: 'count' | 'ratio'): Delta | null {
  if (cur == null || prev == null) return null;
  if (kind === 'ratio') {
    const pts = Math.round(cur * 100) - Math.round(prev * 100);
    return { dir: pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat', text: `${Math.abs(pts)} pts` };
  }
  if (prev === 0) return null;
  const rel = Math.round(((cur - prev) / prev) * 100);
  return { dir: rel > 0 ? 'up' : rel < 0 ? 'down' : 'flat', text: `${Math.abs(rel)}%` };
}

/** Year-to-date range ending today (SUG-5). */
export function ytdRange(today: ISODate): DateRange {
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}

export function previousRange(r: DateRange): DateRange {
  const len = daysBetween(r.start, r.end);
  const end = addDays(r.start, -1);
  return { start: addDays(end, -len), end };
}
