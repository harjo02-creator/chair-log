/**
 * Employer Value: the three things a clinic director asks an injector for, over a rolling window.
 * 1. Volume of active clients  2. Retention and rebook rate  3. Revenue production.
 * Built from visits where she logged them and monthly totals where she didn't; every figure says which.
 */
import { areaCategory } from './catalog';
import { rollingRange } from './dates';
import { money, pct } from './format';
import { filterRange, retention } from './metrics';
import { missingMonths, monthSeries, type MonthPoint } from './monthly';
import type { MonthRecord } from './monthRecords';
import type { Catalogs, Cents, Visit, YearMonth } from './types';

export type MetricStatus = 'tracked' | 'estimate' | 'partial' | 'missing';

export interface ValueMetric {
  key: string;
  label: string;
  value: number | null;
  display: string;
  sub: string;
  status: MetricStatus;
  /** Month labels this metric is missing data for. */
  missing: string[];
  /** What to record to fill the gap, shown when status is partial or missing. */
  need: string;
}

/** Return windows employers ask about: neuromodulator every 3–4 months, filler every 9–12. */
export const RETURN_WINDOWS: Record<'TOX' | 'FILLER', { min: number; max: number; label: string }> = {
  TOX: { min: 90, max: 120, label: '3–4 months' },
  FILLER: { min: 270, max: 365, label: '9–12 months' },
};

export interface ValueModel {
  endYm: YearMonth;
  months: number;
  points: MonthPoint[];
  hasData: boolean;
  usesEstimates: boolean;
  volume: ValueMetric[];
  retention: ValueMetric[];
  revenue: ValueMetric[];
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function status(value: number | null, missing: string[], usedEstimate: boolean): MetricStatus {
  if (value == null) return 'missing';
  if (missing.length) return 'partial';
  return usedEstimate ? 'estimate' : 'tracked';
}

/** Repeat visits of one category whose interval landed in that category's return window. */
export function onScheduleReturns(
  V: readonly Visit[],
  catalogs: Catalogs,
  category: 'TOX' | 'FILLER',
): { inWindow: number; total: number; rate: number | null } {
  const w = RETURN_WINDOWS[category];
  const repeat = V.filter(
    (v) => v.visitType === 'REPEAT' && v.intervalDays != null && areaCategory(catalogs, v.area) === category,
  );
  const inWindow = repeat.filter((v) => v.intervalDays! >= w.min && v.intervalDays! <= w.max).length;
  return { inWindow, total: repeat.length, rate: ratio(inWindow, repeat.length) };
}

export function buildValue(
  visits: readonly Visit[],
  records: readonly MonthRecord[],
  catalogs: Catalogs,
  endYm: YearMonth,
  months: number,
): ValueModel {
  const range = rollingRange(endYm, months);
  const points = monthSeries(endYm, months, visits, records, catalogs);
  const visitMonths = new Set(points.filter((p) => p.source === 'visits').map((p) => p.ym));
  const V = filterRange(visits, range).filter((v) => visitMonths.has(v.date.slice(0, 7)));
  const est = points.filter((p) => p.source === 'estimate');
  const active = points.filter((p) => p.source !== 'none');
  const usesEstimates = est.length > 0;
  const sum = (pts: MonthPoint[], f: (p: MonthPoint) => number | null) =>
    pts.reduce((s, p) => s + (f(p) ?? 0), 0);

  /* ---------- 1. Volume of active clients ---------- */
  const ret = retention(V);
  const estNew = est.filter((p) => p.newClients != null);
  const missNew = missingMonths(est, ['newClients']);
  const uniqueClients = V.length || estNew.length ? ret.unique + sum(estNew, (p) => p.newClients) : null;
  const apptMissing = missingMonths(active, ['appointments']);
  const appointments = active.some((p) => p.appointments != null) ? sum(active, (p) => p.appointments) : null;
  const visitsPerClient = V.length && !usesEstimates && ret.unique ? V.length / ret.unique : null;

  const volume: ValueMetric[] = [
    {
      key: 'uniqueClients',
      label: 'Active clients',
      value: uniqueClients,
      display: uniqueClients == null ? '—' : String(uniqueClients),
      sub: 'Different people who sat in your chair',
      status: status(uniqueClients, missNew, estNew.length > 0),
      missing: missNew,
      need: 'new clients per month',
    },
    {
      key: 'appointments',
      label: 'Appointments',
      value: appointments,
      display: appointments == null ? '—' : appointments.toLocaleString('en-US'),
      sub:
        appointments == null || !active.length
          ? 'Completed appointments'
          : `About ${Math.round(appointments / active.length)} a month`,
      status: status(appointments, apptMissing, usesEstimates),
      missing: apptMissing,
      need: 'appointments per month',
    },
    {
      key: 'visitsPerClient',
      label: 'Visits per client',
      value: visitsPerClient,
      display: visitsPerClient == null ? '—' : visitsPerClient.toFixed(1),
      sub: 'How often the same people come back',
      status: visitsPerClient == null ? 'missing' : 'tracked',
      missing: visitsPerClient == null ? est.map((p) => p.label) : [],
      need: 'visit-by-visit entries with client IDs',
    },
  ];

  /* ---------- 2. Retention and rebook rate ---------- */
  const estSplit = est.filter((p) => p.newClients != null && p.returningClients != null);
  const missSplit = missingMonths(est, ['newClients', 'returningClients']);
  const returning = ret.returning + sum(estSplit, (p) => p.returningClients);
  const seen = ret.unique + sum(estSplit, (p) => (p.newClients ?? 0) + (p.returningClients ?? 0));
  const retentionRate = V.length || estSplit.length ? ratio(returning, seen) : null;

  const rebooked = V.filter((v) => v.rebooked).length;
  const rebookRate = V.length ? ratio(rebooked, V.length) : null;
  const tox = onScheduleReturns(V, catalogs, 'TOX');
  const filler = onScheduleReturns(V, catalogs, 'FILLER');
  const estLabels = est.map((p) => p.label);

  const retentionMetrics: ValueMetric[] = [
    {
      key: 'retention',
      label: 'Returning clients',
      value: retentionRate,
      display: pct(retentionRate),
      sub: 'Share of your clients who came back to you',
      status: status(retentionRate, missSplit, estSplit.length > 0),
      missing: missSplit,
      need: 'new and returning clients per month',
    },
    {
      key: 'rebook',
      label: 'Rebooked at checkout',
      value: rebookRate,
      display: pct(rebookRate),
      sub: V.length
        ? `${rebooked} of ${V.length} visits booked their next one`
        : 'Next visit booked before leaving',
      status: status(rebookRate, rebookRate == null ? [] : estLabels, false),
      missing: rebookRate == null ? active.map((p) => p.label) : estLabels,
      need: 'visit-by-visit entries with “Rebooked”',
    },
    {
      key: 'toxReturn',
      label: `Tox back in ${RETURN_WINDOWS.TOX.label}`,
      value: tox.rate,
      display: pct(tox.rate),
      sub: tox.total
        ? `${tox.inWindow} of ${tox.total} repeat tox visits`
        : 'Repeat neuromodulator visits on schedule',
      status: tox.rate == null ? 'missing' : estLabels.length ? 'partial' : 'tracked',
      missing: tox.rate == null ? active.map((p) => p.label) : estLabels,
      need: 'repeat tox visits with the days since the last one',
    },
    {
      key: 'fillerReturn',
      label: `Filler back in ${RETURN_WINDOWS.FILLER.label}`,
      value: filler.rate,
      display: pct(filler.rate),
      sub: filler.total
        ? `${filler.inWindow} of ${filler.total} repeat filler visits`
        : 'Repeat filler visits on schedule',
      status: filler.rate == null ? 'missing' : estLabels.length ? 'partial' : 'tracked',
      missing: filler.rate == null ? active.map((p) => p.label) : estLabels,
      need: 'repeat filler visits with the days since the last one',
    },
  ];

  /* ---------- 3. Revenue production ---------- */
  const withGross = active.filter((p) => p.grossCents != null);
  const missGross = missingMonths(active, ['serviceCents']);
  const gross: Cents | null = withGross.length ? sum(withGross, (p) => p.grossCents) : null;
  const grossAppts = sum(withGross, (p) => p.appointments);
  const avgTicket = gross != null && grossAppts ? gross / grossAppts : null;
  const annual = gross != null ? (gross / withGross.length) * 12 : null;
  const withRetail = active.filter((p) => p.retailCents != null && p.grossCents != null);
  const missRetail = missingMonths(active, ['retailCents']);
  const retailCents = withRetail.length ? sum(withRetail, (p) => p.retailCents) : null;
  const retailShare =
    retailCents != null
      ? ratio(
          retailCents,
          sum(withRetail, (p) => p.grossCents),
        )
      : null;
  const grossUsesEst = withGross.some((p) => p.source === 'estimate');

  const revenue: ValueMetric[] = [
    {
      key: 'avgTicket',
      label: 'Average spend per ticket',
      value: avgTicket,
      display: money(avgTicket),
      sub: 'Services plus retail ÷ appointments',
      status: status(avgTicket, missGross, grossUsesEst),
      missing: missGross,
      need: 'revenue per month',
    },
    {
      key: 'annual',
      label: 'Annual gross billing',
      value: annual,
      display: money(annual),
      sub: withGross.length
        ? `Projected: average month × 12, from ${withGross.length} month${withGross.length === 1 ? '' : 's'}`
        : 'Projected from monthly billing',
      status: status(annual, missGross, grossUsesEst),
      missing: missGross,
      need: 'revenue per month',
    },
    {
      key: 'gross',
      label: 'Gross billing',
      value: gross,
      display: money(gross),
      sub: `Over the last ${months} months`,
      status: status(gross, missGross, grossUsesEst),
      missing: missGross,
      need: 'revenue per month',
    },
    {
      key: 'retailShare',
      label: 'Retail and skincare',
      value: retailShare,
      display: pct(retailShare),
      sub: retailCents != null ? `${money(retailCents)} of gross billing` : 'Share of billing from products',
      status: status(
        retailShare,
        missRetail,
        withRetail.some((p) => p.source === 'estimate'),
      ),
      missing: missRetail,
      need: 'retail sales per month',
    },
  ];

  return {
    endYm,
    months,
    points,
    hasData: active.length > 0,
    usesEstimates,
    volume,
    retention: retentionMetrics,
    revenue,
  };
}

export interface ValuePitchPart {
  text: string;
  strong?: boolean;
}

/** One paragraph she can say or paste, using only the figures that exist. */
export function valuePitch(m: ValueModel): ValuePitchPart[] {
  const get = (list: ValueMetric[], key: string) => list.find((x) => x.key === key)!;
  const clients = get(m.volume, 'uniqueClients');
  const appts = get(m.volume, 'appointments');
  const ret = get(m.retention, 'retention');
  const rebook = get(m.retention, 'rebook');
  const ticket = get(m.revenue, 'avgTicket');
  const annual = get(m.revenue, 'annual');

  const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
  const parts: ValuePitchPart[] = [{ text: `Over the last ${m.months} months I ` }];
  const clientText = clients.value == null ? '' : `${clients.display} ${plural(clients.value, 'client')}`;
  if (appts.value != null) {
    parts.push(
      { text: 'completed ' },
      { text: `${appts.display} ${plural(appts.value, 'appointment')}`, strong: true },
    );
    if (clientText) parts.push({ text: ' for ' }, { text: clientText, strong: true });
  } else if (clientText) {
    parts.push({ text: 'treated ' }, { text: clientText, strong: true });
  } else parts.push({ text: 'built my book of business' });
  if (ticket.value != null)
    parts.push({ text: ' at an average ticket of ' }, { text: ticket.display, strong: true });
  parts.push({ text: '.' });
  if (annual.value != null)
    parts.push(
      { text: ' That puts me on pace for about ' },
      { text: annual.display, strong: true },
      {
        text: ' a year in gross billing.',
      },
    );
  if (ret.value != null)
    parts.push(
      { text: ' ' },
      { text: ret.display, strong: true },
      { text: ' of my clients come back to me' },
    );
  if (rebook.value != null)
    parts.push(
      { text: ret.value != null ? ', and I rebook ' : ' I rebook ' },
      { text: rebook.display, strong: true },
      { text: ' at checkout' },
    );
  if (ret.value != null || rebook.value != null) parts.push({ text: '.' });
  if (m.usesEstimates) parts.push({ text: ' Some months are my own estimates.' });
  return parts;
}
