import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import {
  buildRecommendations,
  calendarWeeks,
  cohortRetention,
  goalProgress,
  rebookPipeline,
  topClients,
  visitsPerClient,
  visitTrend,
  weekdaysInMonth,
  weekdayStats,
  type Goal,
} from '../../src/domain/insights';
import { emptyMonthRecord } from '../../src/domain/monthRecords';
import { monthPoint, monthSeries } from '../../src/domain/monthly';
import type { Visit } from '../../src/domain/types';
import { makeLine, makeVisit, SEPTEMBER_VISITS } from '../fixtures/september-2026';

const C = DEFAULT_CATALOGS;
const TODAY = '2026-10-17';
const tox = (
  date: string,
  id: string,
  opts: Parameters<typeof makeVisit>[6] = {},
  type: 'NEW_CONSULT' | 'REPEAT' = 'REPEAT',
) => makeVisit(date, id, type, 'CLINIC_LEAD', 'upper-face-tox', [makeLine('botox', 36)], opts);
const filler = (date: string, id: string) =>
  makeVisit(date, id, 'NEW_CONSULT', 'REFERRAL', 'lip-filler', [makeLine('restylane-kysse', 1)]);

describe('cohortRetention', () => {
  const visits = [
    tox('2026-04-03', 'A-01', {}, 'NEW_CONSULT'),
    tox('2026-05-03', 'A-01'),
    tox('2026-04-10', 'B-01', {}, 'NEW_CONSULT'),
    tox('2026-05-12', 'C-01', {}, 'NEW_CONSULT'),
    tox('2026-07-20', 'C-01'),
  ];
  const rows = cohortRetention(visits, '2026-07', 4, 3);

  it('groups clients by the month of their first visit', () => {
    expect(rows.map((r) => [r.ym, r.size])).toEqual([
      ['2026-04', 2],
      ['2026-05', 1],
      ['2026-06', 0],
      ['2026-07', 0],
    ]);
  });
  it('counts a client as returned once any later visit falls in the window', () => {
    expect(rows[0]!.returned).toEqual([0.5, 0.5, 0.5]);
    expect(rows[1]!.returned).toEqual([0, 1, null]);
    expect(rows[3]!.returned).toEqual([null, null, null]);
  });
});

describe('visitsPerClient and topClients', () => {
  it('buckets clients by visit count, 5+ last', () => {
    const vs = [...Array(6)]
      .map((_, i) => tox(`2026-0${i + 1}-01`, 'A-01'))
      .concat(tox('2026-01-02', 'B-01'));
    expect(visitsPerClient(vs).map((b) => b.clients)).toEqual([1, 0, 0, 0, 1]);
  });
  it('ranks clients by lifetime billing', () => {
    const top = topClients(SEPTEMBER_VISITS, 3);
    expect(top).toHaveLength(3);
    expect(top[0]!.grossCents).toBeGreaterThanOrEqual(top[1]!.grossCents);
  });
});

describe('rebookPipeline', () => {
  const visits: Visit[] = [
    tox('2026-07-01', 'DUE-01'), // 108 days ago: inside 90–120
    tox('2026-06-01', 'OVR-01'), // window ended Sep 29: overdue
    tox('2026-03-01', 'OLD-01'), // window ended Jun 29, >90 days ago: lapsed
    tox('2026-09-01', 'BKD-01', { rebook: 90 }), // booked for Nov 30
    filler('2026-08-01', 'FIL-01'), // due from Apr 28, 2027
    tox('2026-08-01', 'UP-01'), // due from Oct 30
  ];
  const p = rebookPipeline(visits, C, TODAY);
  const status = Object.fromEntries(p.clients.map((c) => [c.clientId, c.status]));

  it('classifies each client by their last visit', () => {
    expect(status).toEqual({
      'DUE-01': 'due',
      'OVR-01': 'overdue',
      'OLD-01': 'lapsed',
      'BKD-01': 'booked',
      'FIL-01': 'upcoming',
      'UP-01': 'upcoming',
    });
    expect(p.booked).toBe(1);
    expect(p.overdue.map((c) => c.clientId)).toEqual(['OVR-01']);
    expect(p.overdueCents).toBe(46_800);
  });

  it('places upcoming clients in the week their window opens', () => {
    expect(p.weeks).toHaveLength(12);
    expect(p.weeks[0]!.start).toBe('2026-10-12');
    expect(p.weeks[2]).toMatchObject({ start: '2026-10-26', clients: 1, atStakeCents: 46_800 });
    expect(p.weeks.reduce((s, w) => s + w.clients, 0)).toBe(1);
  });

  it('treats a booking well past its date as missed', () => {
    const late = rebookPipeline([tox('2026-05-01', 'X-01', { rebook: 90 })], C, TODAY);
    expect(late.clients[0]!.status).toBe('overdue');
  });
});

describe('busy patterns', () => {
  it('averages visits per worked day for each weekday, Monday first', () => {
    const s = weekdayStats(SEPTEMBER_VISITS);
    expect(s.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(s.reduce((n, d) => n + d.visits, 0)).toBe(10);
    const wed = s[2]!; // Sep 2, 9, 16, 23, 30 are Wednesdays
    expect(wed.visitsPerDay).toBe(wed.visits / wed.chairDays);
  });
  it('lays out whole weeks ending with the given week', () => {
    const weeks = calendarWeeks(SEPTEMBER_VISITS, '2026-09-30', 5);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]!.date).toBe('2026-08-31');
    expect(weeks.flat().reduce((n, d) => n + d.visits, 0)).toBe(10);
    expect(weeks[4]!.find((d) => d.date === '2026-10-01')!.inRange).toBe(false);
  });
  it('counts weekdays in a month', () => {
    expect(weekdaysInMonth('2026-09')).toBe(22);
    expect(weekdaysInMonth('2026-02')).toBe(20);
  });
});

describe('visitTrend', () => {
  it('gives null rates for months without visits', () => {
    const t = visitTrend(SEPTEMBER_VISITS, C, '2026-09', 2);
    expect(t[0]).toMatchObject({ ym: '2026-08', n: 0, rebookRate: null });
    expect(t[1]).toMatchObject({ ym: '2026-09', n: 10, rebookRate: 0.7, retailConversion: 0.3 });
    expect(t[1]!.avgTicket.TOX).not.toBeNull();
  });
});

describe('goalProgress', () => {
  const sep = monthPoint('2026-09', SEPTEMBER_VISITS, [], C);
  const goal = (metric: Goal['metric'], target: number): Goal => ({ metric, target, updatedAt: '' });

  it('is met when the month reached the target', () => {
    expect(goalProgress(goal('appointments', 10), sep, TODAY).status).toBe('met');
  });
  it('judges a past month that fell short as behind', () => {
    const g = goalProgress(goal('gross', 1_000_000), sep, TODAY);
    expect(g.status).toBe('behind');
    expect(g.expected).toBe(1);
    expect(g.text).toBe('$8,874 of $10,000');
  });
  it('judges the current month against how much of it has passed', () => {
    const oct = { ...sep, ym: '2026-10' };
    // Oct 17 of 31: 55% gone; 8,874 of 15,000 is 59%.
    expect(goalProgress(goal('gross', 1_500_000), oct, TODAY).status).toBe('on-track');
    expect(goalProgress(goal('gross', 3_000_000), oct, TODAY).status).toBe('behind');
  });
  it('judges a rate goal against the target, not the calendar', () => {
    const oct = { ...sep, ym: '2026-10' }; // rebook rate 70%
    expect(goalProgress(goal('rebookRate', 0.75), oct, TODAY).status).toBe('on-track');
    expect(goalProgress(goal('rebookRate', 0.9), oct, TODAY).status).toBe('behind');
    expect(goalProgress(goal('rebookRate', 0.9), oct, TODAY).expected).toBe(1);
  });
  it('says when there is nothing to measure', () => {
    const empty = monthPoint('2026-10', [], [], C);
    expect(goalProgress(goal('retail', 50_000), empty, TODAY).status).toBe('no-data');
  });
});

describe('buildRecommendations', () => {
  // 12 recent tox visits, 2 rebooked, no retail, all clinic leads.
  const recent = [...Array(12)].map((_, i) =>
    tox(
      `2026-10-${String(i + 1).padStart(2, '0')}`,
      `R-${String(i + 1).padStart(2, '0')}`,
      i < 2 ? { rebook: 90 } : {},
    ),
  );
  const visits = [...recent, tox('2026-06-01', 'OVR-01')];
  const months = monthSeries('2026-10', 3, visits, [{ ...emptyMonthRecord('2026-09', ''), daysOut: 4 }], C);
  const recs = buildRecommendations({ visits, catalogs: C, recentMonths: months, goals: [], today: TODAY });
  const ids = recs.map((r) => r.id);

  it('flags low rebook, retail, ticket and independence with their numbers', () => {
    expect(ids).toEqual(expect.arrayContaining(['rebook', 'retail', 'overdue', 'independence', 'days-out']));
    expect(recs.find((r) => r.id === 'rebook')!.finding).toMatch(/2 of 13|2 of 12/);
  });
  it('ranks actions before things to watch, biggest value first', () => {
    const tones = recs.map((r) => r.tone);
    expect(tones.indexOf('watch')).toBeGreaterThan(tones.lastIndexOf('act'));
    const acts = recs.filter((r) => r.tone === 'act' && r.impactCents != null).map((r) => r.impactCents!);
    expect(acts).toEqual([...acts].sort((a, b) => b - a));
  });
  it('lists strengths when the numbers are good', () => {
    const good = recent.map((v) => ({
      ...v,
      rebooked: true,
      rebookDays: 90,
      source: 'SELF_SOURCED' as const,
    }));
    const r = buildRecommendations({ visits: good, catalogs: C, recentMonths: [], goals: [], today: TODAY });
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(['rebook-strong', 'independence-strong']));
    expect(r.at(-1)!.tone).toBe('strength');
  });
  it('stays quiet about rates when there are too few visits', () => {
    const r = buildRecommendations({
      visits: recent.slice(0, 3),
      catalogs: C,
      recentMonths: [],
      goals: [],
      today: TODAY,
    });
    expect(r.map((x) => x.id)).not.toContain('rebook');
  });
  it('asks for client counts when recent months are estimates only', () => {
    const est = monthSeries('2026-10', 3, [], [{ ...emptyMonthRecord('2026-09', ''), appointments: 40 }], C);
    const r = buildRecommendations({ visits: [], catalogs: C, recentMonths: est, goals: [], today: TODAY });
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(['data-retention', 'data-retail']));
  });
});
