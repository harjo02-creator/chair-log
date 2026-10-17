/**
 * Insights: deeper views of her book for her own use. Pure functions over visits, monthly records
 * and goals; the Insights screen only formats what these return.
 */
import { areaCategory } from './catalog';
import { clientSummaries, type ClientSummary } from './clients';
import {
  addDays,
  addMonths,
  daysBetween,
  monthEnd,
  monthOf,
  monthRange,
  parseISODate,
  weekStart,
  type DateRange,
} from './dates';
import { fmtShortDate, money, monthShort, pct } from './format';
import { categoryTickets, computeMetrics, filterRange, TICKET_BENCHMARKS } from './metrics';
import type { MonthPoint } from './monthly';
import {
  CATEGORIES,
  type Catalogs,
  type Category,
  type Cents,
  type ISODate,
  type Visit,
  type YearMonth,
} from './types';

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/* ---------- client loyalty ---------- */

export interface CohortRow {
  ym: YearMonth;
  label: string;
  /** Clients whose first logged visit was this month. */
  size: number;
  /** Share of the cohort seen again within k+1 months; null where that month hasn't happened yet. */
  returned: (number | null)[];
}

/** Cohort retention for the `cohorts` months ending `endYm`, looking `horizon` months ahead. */
export function cohortRetention(
  visits: readonly Visit[],
  endYm: YearMonth,
  cohorts = 6,
  horizon = 6,
): CohortRow[] {
  const byClient = new Map<string, YearMonth[]>();
  for (const v of visits) {
    const list = byClient.get(v.clientId) ?? [];
    list.push(monthOf(v.date));
    byClient.set(v.clientId, list);
  }
  const first = new Map<string, YearMonth>();
  for (const [id, months] of byClient)
    first.set(
      id,
      months.reduce((a, b) => (b < a ? b : a)),
    );

  const rows: CohortRow[] = [];
  for (let i = cohorts - 1; i >= 0; i--) {
    const ym = addMonths(endYm, -i);
    const members = [...first].filter(([, m]) => m === ym).map(([id]) => id);
    const returned: (number | null)[] = [];
    for (let k = 1; k <= horizon; k++) {
      const last = addMonths(ym, k);
      if (last > endYm) {
        returned.push(null);
        continue;
      }
      const back = members.filter((id) => byClient.get(id)!.some((m) => m > ym && m <= last)).length;
      returned.push(members.length ? back / members.length : null);
    }
    rows.push({ ym, label: monthShort(ym), size: members.length, returned });
  }
  return rows;
}

export const VISIT_COUNT_BUCKETS = ['1', '2', '3', '4', '5+'] as const;

/** How many clients have 1, 2, 3, 4 or 5+ visits. */
export function visitsPerClient(visits: readonly Visit[]): { label: string; clients: number }[] {
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(v.clientId, (counts.get(v.clientId) ?? 0) + 1);
  const out = VISIT_COUNT_BUCKETS.map((label) => ({ label, clients: 0 }));
  for (const n of counts.values()) out[Math.min(n, 5) - 1]!.clients++;
  return out;
}

/** Clients by lifetime billing (services + retail), highest first. IDs only. */
export function topClients(visits: readonly Visit[], n = 10): ClientSummary[] {
  return clientSummaries(visits)
    .sort((a, b) => b.grossCents - a.grossCents || a.clientId.localeCompare(b.clientId))
    .slice(0, n);
}

/* ---------- rebook pipeline ---------- */

/** When a client is due back after their last visit, in days. */
export const DUE_WINDOWS: Record<Category, { min: number; max: number }> = {
  TOX: { min: 90, max: 120 },
  FILLER: { min: 270, max: 365 },
  BIO: { min: 35, max: 56 },
};
/** Past the window by more than this, a client counts as lapsed rather than overdue. */
const LAPSED_AFTER_DAYS = 90;
/** A booked return that hasn't happened this long after its date is treated as missed. */
const BOOKING_GRACE_DAYS = 14;

export type PipelineStatus = 'booked' | 'upcoming' | 'due' | 'overdue' | 'lapsed';

export interface PipelineClient {
  clientId: string;
  category: Category;
  lastDate: ISODate;
  dueStart: ISODate;
  dueEnd: ISODate;
  lastTicketCents: Cents;
  status: PipelineStatus;
}

export interface PipelineWeek {
  start: ISODate;
  label: string;
  clients: number;
  atStakeCents: Cents;
}

export interface Pipeline {
  clients: PipelineClient[];
  weeks: PipelineWeek[];
  due: PipelineClient[];
  overdue: PipelineClient[];
  booked: number;
  overdueCents: Cents;
  dueCents: Cents;
}

export function rebookPipeline(
  visits: readonly Visit[],
  catalogs: Catalogs,
  today: ISODate,
  weeks = 12,
): Pipeline {
  const latest = new Map<string, Visit>();
  for (const v of visits) {
    if (v.date > today) continue;
    const cur = latest.get(v.clientId);
    if (!cur || v.date > cur.date || (v.date === cur.date && v.createdAt > cur.createdAt))
      latest.set(v.clientId, v);
  }
  const clients: PipelineClient[] = [];
  for (const v of latest.values()) {
    const category = areaCategory(catalogs, v.area);
    if (!category) continue;
    const w = DUE_WINDOWS[category];
    const dueStart = addDays(v.date, w.min);
    const dueEnd = addDays(v.date, w.max);
    let status: PipelineStatus;
    const bookedFor = v.rebooked && v.rebookDays != null ? addDays(v.date, v.rebookDays) : null;
    if (bookedFor && daysBetween(bookedFor, today) <= BOOKING_GRACE_DAYS) status = 'booked';
    else if (today < dueStart) status = 'upcoming';
    else if (today <= dueEnd) status = 'due';
    else if (daysBetween(dueEnd, today) <= LAPSED_AFTER_DAYS) status = 'overdue';
    else status = 'lapsed';
    clients.push({
      clientId: v.clientId,
      category,
      lastDate: v.date,
      dueStart,
      dueEnd,
      lastTicketCents: v.serviceGrossCents + v.retailCents,
      status,
    });
  }

  const ws = weekStart(today);
  const weekRows: PipelineWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = addDays(ws, i * 7);
    const end = addDays(start, 6);
    const inWeek = clients.filter((c) => c.status === 'upcoming' && c.dueStart >= start && c.dueStart <= end);
    weekRows.push({
      start,
      label: fmtShortDate(start),
      clients: inWeek.length,
      atStakeCents: inWeek.reduce((s, c) => s + c.lastTicketCents, 0),
    });
  }
  const byOldest = (a: PipelineClient, b: PipelineClient) =>
    a.dueEnd.localeCompare(b.dueEnd) || a.clientId.localeCompare(b.clientId);
  const due = clients.filter((c) => c.status === 'due').sort(byOldest);
  const overdue = clients.filter((c) => c.status === 'overdue').sort(byOldest);
  return {
    clients,
    weeks: weekRows,
    due,
    overdue,
    booked: clients.filter((c) => c.status === 'booked').length,
    overdueCents: overdue.reduce((s, c) => s + c.lastTicketCents, 0),
    dueCents: due.reduce((s, c) => s + c.lastTicketCents, 0),
  };
}

/* ---------- busy patterns ---------- */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface WeekdayStat {
  day: (typeof WEEKDAYS)[number];
  chairDays: number;
  visits: number;
  grossCents: Cents;
  /** Average visits on the days she worked that weekday. */
  visitsPerDay: number | null;
  grossPerDay: Cents | null;
}

export function weekdayStats(V: readonly Visit[]): WeekdayStat[] {
  const rows = WEEKDAYS.map((day) => ({ day, dates: new Set<string>(), visits: 0, grossCents: 0 }));
  for (const v of V) {
    const r = rows[(parseISODate(v.date).getDay() + 6) % 7]!;
    r.dates.add(v.date);
    r.visits++;
    r.grossCents += v.serviceGrossCents + v.retailCents;
  }
  return rows.map((r) => ({
    day: r.day,
    chairDays: r.dates.size,
    visits: r.visits,
    grossCents: r.grossCents,
    visitsPerDay: ratio(r.visits, r.dates.size),
    grossPerDay: ratio(r.grossCents, r.dates.size),
  }));
}

export interface CalendarDay {
  date: ISODate;
  visits: number;
  grossCents: Cents;
  /** False for padding days after `end`. */
  inRange: boolean;
}

/** `weeks` Monday-start weeks ending with the week of `end`, oldest first. */
export function calendarWeeks(V: readonly Visit[], end: ISODate, weeks = 26): CalendarDay[][] {
  const byDate = new Map<string, { visits: number; grossCents: number }>();
  for (const v of V) {
    const d = byDate.get(v.date) ?? { visits: 0, grossCents: 0 };
    d.visits++;
    d.grossCents += v.serviceGrossCents + v.retailCents;
    byDate.set(v.date, d);
  }
  const first = addDays(weekStart(end), -(weeks - 1) * 7);
  const out: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const x = byDate.get(date);
      week.push({ date, visits: x?.visits ?? 0, grossCents: x?.grossCents ?? 0, inRange: date <= end });
    }
    out.push(week);
  }
  return out;
}

/** Mon–Fri days in a month, a stand-in for available days when only monthly totals exist. */
export function weekdaysInMonth(ym: YearMonth): number {
  let n = 0;
  for (let d = `${ym}-01`; d <= monthEnd(ym); d = addDays(d, 1)) {
    const wd = parseISODate(d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Average production per working day: from logged chair days where there are visits, otherwise
 * monthly billing over weekdays minus days out.
 */
export function productionPerDay(points: readonly MonthPoint[], visits: readonly Visit[]): Cents | null {
  let cents = 0;
  let days = 0;
  for (const p of points) {
    if (p.source === 'visits') {
      const V = filterRange(visits, monthRange(p.ym));
      cents += p.grossCents ?? 0;
      days += new Set(V.map((v) => v.date)).size;
    } else if (p.source === 'estimate' && p.grossCents != null) {
      cents += p.grossCents;
      days += Math.max(1, weekdaysInMonth(p.ym) - (p.daysOut ?? 0));
    }
  }
  return ratio(cents, days);
}

/* ---------- growth and mix ---------- */

export interface VisitTrendPoint {
  ym: YearMonth;
  label: string;
  n: number;
  avgTicket: Record<Category, Cents | null>;
  retailConversion: number | null;
  independence: number | null;
  selfSourcedShare: number | null;
  referralShare: number | null;
  rebookRate: number | null;
}

/** Visit-level rates by month. Months without logged visits have n = 0 and null rates. */
export function visitTrend(
  visits: readonly Visit[],
  catalogs: Catalogs,
  endYm: YearMonth,
  months = 6,
): VisitTrendPoint[] {
  const out: VisitTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonths(endYm, -i);
    const V = filterRange(visits, monthRange(ym));
    const m = computeMetrics(V, catalogs);
    const tickets = categoryTickets(V, catalogs);
    const avgTicket = Object.fromEntries(
      CATEGORIES.map((c) => [c, tickets.find((t) => t.category === c)!.avgTicketCents]),
    ) as Record<Category, Cents | null>;
    out.push({
      ym,
      label: monthShort(ym),
      n: m.n,
      avgTicket,
      retailConversion: m.retailConversion,
      independence: m.independence,
      selfSourcedShare: m.selfSourcedShare,
      referralShare: m.referralShare,
      rebookRate: m.rebookRate,
    });
  }
  return out;
}

/* ---------- goals ---------- */

export type GoalMetric = 'gross' | 'appointments' | 'newClients' | 'rebookRate' | 'retail';

export interface Goal {
  metric: GoalMetric;
  /** Cents for money goals, a count, or a 0..1 ratio for rates. */
  target: number;
  updatedAt: string;
}

export const GOAL_META: Record<GoalMetric, { label: string; kind: 'money' | 'count' | 'ratio' }> = {
  gross: { label: 'Gross billing', kind: 'money' },
  appointments: { label: 'Appointments', kind: 'count' },
  newClients: { label: 'New clients', kind: 'count' },
  rebookRate: { label: 'Rebook rate', kind: 'ratio' },
  retail: { label: 'Retail sales', kind: 'money' },
};
export const GOAL_METRICS = Object.keys(GOAL_META) as GoalMetric[];

export function fmtGoalValue(metric: GoalMetric, v: number | null): string {
  if (v == null) return '—';
  const kind = GOAL_META[metric].kind;
  return kind === 'money' ? money(v) : kind === 'ratio' ? pct(v) : String(Math.round(v));
}

export type GoalStatus = 'met' | 'on-track' | 'behind' | 'no-data';

export interface GoalProgress {
  metric: GoalMetric;
  label: string;
  actual: number | null;
  target: number;
  /** actual ÷ target, uncapped. */
  share: number | null;
  /** Share of the month gone, for the pace marker (1 for rates and past months). */
  expected: number;
  status: GoalStatus;
  text: string;
}

export function goalActual(metric: GoalMetric, p: MonthPoint): number | null {
  switch (metric) {
    case 'gross':
      return p.grossCents;
    case 'appointments':
      return p.appointments;
    case 'newClients':
      return p.newClients;
    case 'rebookRate':
      return p.rebookRate;
    case 'retail':
      return p.retailCents;
  }
}

export function goalProgress(goal: Goal, p: MonthPoint, today: ISODate): GoalProgress {
  const meta = GOAL_META[goal.metric];
  const actual = goalActual(goal.metric, p);
  const current = monthOf(today) === p.ym;
  const elapsed = current
    ? Number(today.slice(8, 10)) / Number(monthEnd(p.ym).slice(8, 10))
    : p.ym < monthOf(today)
      ? 1
      : 0;
  const expected = meta.kind === 'ratio' ? 1 : elapsed;
  const share = actual == null || goal.target <= 0 ? null : actual / goal.target;
  // A total builds through the month, so it's judged against the share of the month gone; a rate
  // doesn't accumulate, so it's judged against the target itself (within 10%).
  let status: GoalStatus;
  if (share == null) status = 'no-data';
  else if (share >= 1) status = 'met';
  else status = share >= expected * 0.9 ? 'on-track' : 'behind';

  const fmt = (v: number | null) => fmtGoalValue(goal.metric, v);
  const text =
    actual == null
      ? `No ${meta.label.toLowerCase()} recorded for ${monthShort(p.ym)} yet`
      : `${fmt(actual)} of ${fmt(goal.target)}`;
  return {
    metric: goal.metric,
    label: meta.label,
    actual,
    target: goal.target,
    share,
    expected,
    status,
    text,
  };
}

/* ---------- recommendations ---------- */

export type RecArea = 'volume' | 'retention' | 'revenue' | 'data';
export type RecTone = 'act' | 'watch' | 'strength';

export interface Recommendation {
  id: string;
  area: RecArea;
  tone: RecTone;
  title: string;
  finding: string;
  action: string;
  /** Rough value at stake, for ranking. Null when it can't be priced. */
  impactCents: Cents | null;
  /** What the value covers: a yearly gain, clients waiting now, or production already lost. */
  impactLabel: 'a year' | 'at stake' | 'of production';
  /** Id of the Insights section with the chart behind it. */
  anchor: string;
}

export const REC_THRESHOLDS = {
  minVisits: 10,
  rebookTarget: 0.6,
  retailTarget: 0.25,
  independenceFloor: 0.4,
  toxCadenceFloor: 0.5,
  daysOutPerQuarter: 3,
} as const;

export interface RecInput {
  visits: readonly Visit[];
  catalogs: Catalogs;
  /** The last few months, oldest first, from monthSeries (visits or monthly totals). */
  recentMonths: readonly MonthPoint[];
  goals: readonly Goal[];
  today: ISODate;
}

/** Rule-based suggestions ranked by what they're worth, then strengths. */
export function buildRecommendations(input: RecInput): Recommendation[] {
  const { visits, catalogs, recentMonths, goals, today } = input;
  const T = REC_THRESHOLDS;
  const range: DateRange = { start: addDays(today, -90), end: today };
  const V = filterRange(visits, range);
  const m = computeMetrics(V, catalogs);
  const perVisit = m.n ? m.grossCents / m.n : null;
  const recs: Recommendation[] = [];
  const enough = m.n >= T.minVisits;

  // Retention: rebook at checkout.
  if (enough && m.rebookRate != null) {
    if (m.rebookRate < T.rebookTarget) {
      const more = Math.ceil((T.rebookTarget - m.rebookRate) * m.n);
      recs.push({
        id: 'rebook',
        area: 'retention',
        tone: 'act',
        title: 'Book the next visit before the client leaves',
        finding: `${pct(m.rebookRate)} of visits in the last 90 days rebooked at checkout (${m.rebookedCount} of ${m.n}).`,
        action: `Offer a date before checkout: tox at 12–14 weeks, filler at 9–12 months. Reaching ${pct(T.rebookTarget)} means about ${more} more booked visits a quarter.`,
        impactCents: perVisit == null ? null : Math.round(more * perVisit * 4),
        impactLabel: 'a year',
        anchor: 'pipeline',
      });
    } else
      recs.push({
        id: 'rebook-strong',
        area: 'retention',
        tone: 'strength',
        title: `Rebook rate is strong at ${pct(m.rebookRate)}`,
        finding: `${m.rebookedCount} of ${m.n} visits in the last 90 days booked their next appointment at checkout.`,
        action: 'Lead with this number with employers: it shows clients commit to coming back to you.',
        impactCents: null,
        impactLabel: 'at stake',
        anchor: 'pipeline',
      });
  }

  // Retention: overdue and due clients.
  const pipe = rebookPipeline(visits, catalogs, today);
  if (pipe.overdue.length)
    recs.push({
      id: 'overdue',
      area: 'retention',
      tone: 'act',
      title: `Win back ${pipe.overdue.length} overdue client${pipe.overdue.length === 1 ? '' : 's'}`,
      finding: `${pipe.overdue.length} client${pipe.overdue.length === 1 ? ' is' : 's are'} past their usual return window without a booking, about ${money(pipe.overdueCents)} at their last ticket.`,
      action: `Send a personal check-in to ${pipe.overdue
        .slice(0, 4)
        .map((c) => c.clientId)
        .join(', ')}${pipe.overdue.length > 4 ? ' and the rest of the list' : ''}.`,
      impactCents: pipe.overdueCents,
      impactLabel: 'at stake',
      anchor: 'pipeline',
    });
  if (pipe.due.length)
    recs.push({
      id: 'due',
      area: 'retention',
      tone: 'act',
      title: `${pipe.due.length} client${pipe.due.length === 1 ? ' is' : 's are'} due back now`,
      finding: `They're inside their return window and haven't booked: about ${money(pipe.dueCents)} at their last ticket.`,
      action: 'Send a reminder this week while they are on schedule.',
      impactCents: pipe.dueCents,
      impactLabel: 'at stake',
      anchor: 'pipeline',
    });

  // Retention: tox clients returning on schedule.
  if (m.toxRepeatCount >= 5 && m.toxCadence != null && m.toxCadence < T.toxCadenceFloor)
    recs.push({
      id: 'tox-cadence',
      area: 'retention',
      tone: 'watch',
      title: 'Tox clients are drifting off the 3–4 month schedule',
      finding: `Only ${pct(m.toxCadence)} of ${m.toxRepeatCount} repeat tox visits came back within 90–120 days.`,
      action: 'Book tox follow-ups about 13 weeks out at checkout and explain why timing keeps results even.',
      impactCents: null,
      impactLabel: 'at stake',
      anchor: 'loyalty',
    });

  // Revenue: retail attach.
  if (enough && m.retailConversion != null && m.retailConversion < T.retailTarget) {
    const more = Math.ceil((T.retailTarget - m.retailConversion) * m.n);
    const avgItem = m.retailCount
      ? m.retailCents / m.retailCount
      : catalogs.retail.reduce((s, r) => s + r.defaultPriceCents, 0) / Math.max(1, catalogs.retail.length);
    recs.push({
      id: 'retail',
      area: 'revenue',
      tone: 'act',
      title: 'Pair each treatment with one skincare product',
      finding: `${pct(m.retailConversion)} of visits in the last 90 days included retail (${m.retailCount} of ${m.n}).`,
      action: `Recommend one aftercare or maintenance product per visit. At ${pct(T.retailTarget)}, that's about ${more} more sales a quarter.`,
      impactCents: Math.round(more * avgItem * 4),
      impactLabel: 'a year',
      anchor: 'growth',
    });
  }

  // Revenue: average ticket against benchmark, per category.
  for (const t of categoryTickets(V, catalogs)) {
    const b = TICKET_BENCHMARKS[t.category];
    if (!b || t.avgTicketCents == null || t.visits < 5) continue;
    const name = t.category === 'TOX' ? 'Tox' : 'Filler';
    if (t.avgTicketCents < b.lo)
      recs.push({
        id: `ticket-${t.category}`,
        area: 'revenue',
        tone: 'act',
        title: `${name} tickets are below the typical range`,
        finding: `${name} visits averaged ${money(t.avgTicketCents)} over ${t.visits} visits, below ${b.label}.`,
        action:
          t.category === 'TOX'
            ? 'Check units per area against the treatment defaults, and offer full upper-face plans rather than single areas.'
            : 'Talk through a full-face plan at consults, and note when a second syringe would finish the result.',
        impactCents: Math.round((b.lo - t.avgTicketCents) * t.visits * 4),
        impactLabel: 'a year',
        anchor: 'growth',
      });
    else if (t.avgTicketCents > b.hi)
      recs.push({
        id: `ticket-${t.category}-strong`,
        area: 'revenue',
        tone: 'strength',
        title: `${name} tickets are above the typical range`,
        finding: `${name} visits averaged ${money(t.avgTicketCents)}, above ${b.label}.`,
        action: 'Use this with employers as evidence that clients trust you with full treatment plans.',
        impactCents: null,
        impactLabel: 'at stake',
        anchor: 'growth',
      });
  }

  // Volume: book independence.
  if (enough && m.independence != null) {
    if (m.independence < T.independenceFloor)
      recs.push({
        id: 'independence',
        area: 'volume',
        tone: 'watch',
        title: 'Grow the clients who come for you',
        finding: `${pct(m.independence)} of recent visits were self-sourced or referrals; the rest came from clinic leads.`,
        action:
          'Ask happy clients for referrals and share before-and-afters (with consent). A book that follows you raises your value to any clinic.',
        impactCents: null,
        impactLabel: 'at stake',
        anchor: 'growth',
      });
    else if (m.independence >= 0.5)
      recs.push({
        id: 'independence-strong',
        area: 'volume',
        tone: 'strength',
        title: `${pct(m.independence)} of your chair is your own book`,
        finding: 'Most recent visits came from your own network and referrals rather than clinic leads.',
        action: 'This is the portable book employers pay for. Put it in the first sentence of the pitch.',
        impactCents: null,
        impactLabel: 'at stake',
        anchor: 'growth',
      });
  }

  // Volume: days out of office.
  const daysOut = recentMonths.reduce((s, p) => s + (p.daysOut ?? 0), 0);
  const perDay = productionPerDay(recentMonths, visits);
  if (daysOut >= T.daysOutPerQuarter) {
    const slowest = [...recentMonths]
      .filter((p) => p.grossCents != null)
      .sort((a, b) => a.grossCents! - b.grossCents!)[0];
    recs.push({
      id: 'days-out',
      area: 'volume',
      tone: 'watch',
      title: `${daysOut} days out in the last ${recentMonths.length} months`,
      finding:
        perDay == null
          ? 'Days out of office reduce the appointments you can show.'
          : `At your average of ${money(perDay)} a working day, that's about ${money(daysOut * perDay)} of production.`,
      action: `Plan time off for slower months${slowest ? ` (${slowest.label} was the slowest recently)` : ''}, and offer freed-up slots to a waitlist.`,
      impactCents: perDay == null ? null : Math.round(daysOut * perDay),
      impactLabel: 'of production',
      anchor: 'patterns',
    });
  }

  // Goals behind pace this month.
  const thisMonth = recentMonths.find((p) => p.ym === monthOf(today));
  if (thisMonth)
    for (const g of goals) {
      const gp = goalProgress(g, thisMonth, today);
      if (gp.status !== 'behind') continue;
      recs.push({
        id: `goal-${g.metric}`,
        area:
          g.metric === 'gross' || g.metric === 'retail'
            ? 'revenue'
            : g.metric === 'rebookRate'
              ? 'retention'
              : 'volume',
        tone: 'watch',
        title: `${gp.label} is behind this month's goal`,
        finding: `${gp.text}, with ${pct(1 - gp.expected)} of the month left.`,
        action:
          g.metric === 'rebookRate'
            ? 'Offer the next date at every checkout for the rest of the month.'
            : 'Fill open slots from the due and overdue lists in the rebook pipeline.',
        impactCents: null,
        impactLabel: 'at stake',
        anchor: 'goals',
      });
    }

  // Data gaps that weaken the employer numbers.
  const est = recentMonths.filter((p) => p.source === 'estimate');
  if (!V.length && est.length && est.some((p) => p.newClients == null || p.returningClients == null))
    recs.push({
      id: 'data-retention',
      area: 'data',
      tone: 'watch',
      title: 'Record new and returning clients',
      finding: 'Employers ask what share of clients return to her, and recent months have no client counts.',
      action:
        'Log visits with client IDs (the app works out retention), or add new and returning client counts to each month’s totals.',
      impactCents: null,
      impactLabel: 'at stake',
      anchor: 'loyalty',
    });
  if (recentMonths.some((p) => p.source !== 'none' && p.retailCents == null))
    recs.push({
      id: 'data-retail',
      area: 'data',
      tone: 'watch',
      title: 'Record retail and skincare sales',
      finding: 'Employers count retail in gross billing, and some recent months have none recorded.',
      action: 'Add the retail add-on when logging visits, or a retail total to each month.',
      impactCents: null,
      impactLabel: 'at stake',
      anchor: 'growth',
    });

  const toneRank: Record<RecTone, number> = { act: 0, watch: 1, strength: 2 };
  return recs.sort(
    (a, b) =>
      toneRank[a.tone] - toneRank[b.tone] ||
      (b.impactCents ?? -1) - (a.impactCents ?? -1) ||
      a.id.localeCompare(b.id),
  );
}
