/** Builds everything the Summary and Book of Business screens show, as plain data and strings. */
import { addMonths, monthOf, monthRange, rollingRange, type DateRange } from './dates';
import { fmtLongDate, money, monthName, pct } from './format';
import {
  computeMetrics,
  delta,
  filterRange,
  independenceChip,
  rebookChip,
  retention,
  retentionChip,
  type Chip,
  type Delta,
  type PeriodMetrics,
} from './metrics';
import type { Catalogs, ISODate, Visit, YearMonth } from './types';

export type PeriodMode = 'month' | 'ytd' | 'custom';

export interface Period {
  mode: PeriodMode;
  range: DateRange;
  /** The month, when mode is 'month'. */
  ym: YearMonth | null;
  title: string;
  /** Start of the elevator pitch: "In October", "So far in 2026", "From Sep 1, 2026 to Oct 14, 2026". */
  phrase: string;
}

export function monthPeriod(ym: YearMonth): Period {
  return {
    mode: 'month',
    range: monthRange(ym),
    ym,
    title: monthName(ym),
    phrase: `In ${monthName(ym).split(' ')[0]}`,
  };
}

export function ytdPeriod(today: ISODate): Period {
  const y = today.slice(0, 4);
  return {
    mode: 'ytd',
    range: { start: `${y}-01-01`, end: today },
    ym: null,
    title: `${y} year to date`,
    phrase: `So far in ${y}`,
  };
}

export function customPeriod(start: ISODate, end: ISODate): Period {
  const [s, e] = start <= end ? [start, end] : [end, start];
  return {
    mode: 'custom',
    range: { start: s, end: e },
    ym: null,
    title: `${fmtLongDate(s)} – ${fmtLongDate(e)}`,
    phrase: `From ${fmtLongDate(s)} to ${fmtLongDate(e)}`,
  };
}

export interface Tile {
  key: string;
  label: string;
  value: string;
  sub: string;
  chip: Chip | null;
  delta: Delta | null;
}

export interface SummaryModel {
  period: Period;
  V: Visit[];
  m: PeriodMetrics;
  /** Retention actually shown: the period's, or the rolling window's (SUM-9). */
  retentionShown: { rate: number | null; returning: number; unique: number; label: string };
  tiles: Tile[];
}

export function buildSummary(
  visits: readonly Visit[],
  catalogs: Catalogs,
  period: Period,
  opts: { rolling: boolean; rollingMonths: number },
): SummaryModel {
  const V = filterRange(visits, period.range);
  const m = computeMetrics(V, catalogs);

  const endYm = period.ym ?? monthOf(period.range.end);
  const rolling = opts.rolling
    ? retention(filterRange(visits, rollingRange(endYm, opts.rollingMonths)))
    : null;
  const retentionShown = rolling
    ? {
        rate: rolling.rate,
        returning: rolling.returning,
        unique: rolling.unique,
        label: `Last ${opts.rollingMonths} months`,
      }
    : { rate: m.retention, returning: m.returningClients, unique: m.uniqueClients, label: 'This period' };

  // Month-over-month deltas only make sense for a single month (SUM-10).
  const prev = period.ym
    ? computeMetrics(filterRange(visits, monthRange(addMonths(period.ym, -1))), catalogs)
    : null;
  const prevRet =
    period.ym && rolling
      ? retention(filterRange(visits, rollingRange(addMonths(period.ym, -1), opts.rollingMonths))).rate
      : (prev?.retention ?? null);
  const d = (cur: number | null, p: number | null | undefined, kind: 'count' | 'ratio') =>
    prev && prev.n > 0 ? delta(cur, p ?? null, kind) : null;

  const tiles: Tile[] = [
    {
      key: 'gross',
      label: 'Gross production',
      value: money(m.grossCents),
      sub: `${money(m.serviceCents)} service · ${money(m.retailCents)} retail`,
      chip: null,
      delta: d(m.grossCents, prev?.grossCents, 'count'),
    },
    {
      key: 'appointments',
      label: 'Appointments',
      value: String(m.n),
      sub: `${m.chairDays} chair day${m.chairDays === 1 ? '' : 's'} · ${m.perDay == null ? '—' : m.perDay.toFixed(1)} per day`,
      chip: null,
      delta: d(m.n, prev?.n, 'count'),
    },
    {
      key: 'avgTicket',
      label: 'Average ticket',
      value: money(m.avgTicketCents),
      sub: 'Service gross ÷ appointments',
      chip: null,
      delta: d(m.avgTicketCents, prev?.avgTicketCents, 'count'),
    },
    {
      key: 'unique',
      label: 'Unique clients',
      value: String(m.uniqueClients),
      sub: `${m.returningClients} returning · ${m.newClients} new`,
      chip: null,
      delta: d(m.uniqueClients, prev?.uniqueClients, 'count'),
    },
    {
      key: 'retention',
      label: 'Retention rate',
      value: pct(retentionShown.rate),
      sub: rolling
        ? `${retentionShown.label}: ${retentionShown.returning} of ${retentionShown.unique} clients returned`
        : 'Returning client IDs ÷ unique IDs',
      chip: retentionChip(retentionShown.rate),
      delta: d(retentionShown.rate, prevRet, 'ratio'),
    },
    {
      key: 'rebook',
      label: 'Rebook rate',
      value: pct(m.rebookRate),
      sub: `${m.rebookedCount} of ${m.n} rebooked at checkout`,
      chip: rebookChip(m.rebookRate),
      delta: d(m.rebookRate, prev?.rebookRate, 'ratio'),
    },
    {
      key: 'independence',
      label: 'Book independence',
      value: pct(m.independence),
      sub: `${pct(m.selfSourcedShare)} self-sourced · ${pct(m.referralShare)} referral`,
      chip: independenceChip(m.independence),
      delta: d(m.independence, prev?.independence, 'ratio'),
    },
    {
      key: 'retail',
      label: 'Retail conversion',
      value: pct(m.retailConversion),
      sub: `${m.retailCount} visit${m.retailCount === 1 ? '' : 's'} added skincare`,
      chip: null,
      delta: d(m.retailConversion, prev?.retailConversion, 'ratio'),
    },
  ];

  return { period, V, m, retentionShown, tiles };
}
