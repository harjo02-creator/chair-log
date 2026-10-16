import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { monthRange } from '../../src/domain/dates';
import { money, pct } from '../../src/domain/format';
import {
  categoryTickets,
  computeMetrics,
  defaultMonth,
  delta,
  filterRange,
  independenceChip,
  monthlyTrend,
  monthsWithVisits,
  procedureMix,
  productUsage,
  rebookChip,
  retentionChip,
  sourceCounts,
  timeBuckets,
  toxCadenceBuckets,
} from '../../src/domain/metrics';
import { pitchParts, pitchText } from '../../src/domain/pitch';
import { EXPECTED, SEPTEMBER_VISITS } from '../fixtures/september-2026';

const C = DEFAULT_CATALOGS;
const SEP = monthRange('2026-09');

describe('computeMetrics on the September fixture', () => {
  const m = computeMetrics(filterRange(SEPTEMBER_VISITS, SEP), C);

  it('matches every hand-calculated KPI', () => {
    expect(m.n).toBe(EXPECTED.n);
    expect(m.serviceCents).toBe(EXPECTED.serviceCents);
    expect(m.retailCents).toBe(EXPECTED.retailCents);
    expect(m.grossCents).toBe(EXPECTED.grossCents);
    expect(m.chairDays).toBe(EXPECTED.chairDays);
    expect(m.perDay).toBe(EXPECTED.perDay);
    expect(m.avgTicketCents).toBe(EXPECTED.avgTicketCents);
    expect(m.uniqueClients).toBe(EXPECTED.uniqueClients);
    expect(m.returningClients).toBe(EXPECTED.returningClients);
    expect(m.newClients).toBe(EXPECTED.newClients);
    expect(m.retention).toBe(EXPECTED.retention);
    expect(m.rebookedCount).toBe(EXPECTED.rebookedCount);
    expect(m.rebookRate).toBe(EXPECTED.rebookRate);
    expect(m.selfSourcedCount).toBe(EXPECTED.selfSourcedCount);
    expect(m.referralCount).toBe(EXPECTED.referralCount);
    expect(m.independence).toBe(EXPECTED.independence);
    expect(m.retailCount).toBe(EXPECTED.retailCount);
    expect(m.retailConversion).toBe(EXPECTED.retailConversion);
    expect(m.toxRepeatCount).toBe(EXPECTED.toxRepeatCount);
    expect(m.toxInWindowCount).toBe(EXPECTED.toxInWindowCount);
    expect(m.toxCadence).toBe(EXPECTED.toxCadence);
    expect(m.avgToxUnits).toBeCloseTo(EXPECTED.avgToxUnits, 10);
  });

  it('formats tile values as the spec shows them', () => {
    expect(money(m.grossCents)).toBe('$8,874');
    expect(money(m.avgTicketCents)).toBe('$852');
    expect(pct(m.retention)).toBe('63%');
    expect(pct(m.rebookRate)).toBe('70%');
    expect(pct(m.independence)).toBe('60%');
    expect(pct(m.retailConversion)).toBe('30%');
  });

  it('assigns benchmark chips', () => {
    expect(retentionChip(m.retention)).toMatchObject({ tone: 'good', text: 'Above 60% benchmark' });
    expect(rebookChip(m.rebookRate)).toMatchObject({ tone: 'good', text: 'Strong' });
    expect(independenceChip(m.independence)).toMatchObject({ tone: 'good', text: 'Clients seek her out' });
    expect(retentionChip(0.59)).toMatchObject({ tone: 'warn', icon: '▲' });
    expect(independenceChip(0.49)).toMatchObject({ tone: 'neutral', text: 'Mostly clinic-fed' });
  });

  it('builds the elevator pitch', () => {
    expect(pitchText(pitchParts(m, 'In September'))).toBe(
      'In September I completed 10 appointments for 8 unique clients, producing $8,874 in gross billing with an ' +
        'average service ticket of $852. 63% of my clients were returning patients, I rebooked 70% at checkout, ' +
        'and 60% of my chair came from my own network and referrals rather than clinic leads.',
    );
  });
});

describe('breakdowns', () => {
  const V = filterRange(SEPTEMBER_VISITS, SEP);

  it('weekly buckets are Monday-start and clipped to the month', () => {
    const w = timeBuckets(V, SEP);
    expect(
      w.map(({ label, serviceCents, retailCents, newCount, repeatCount }) => ({
        label,
        serviceCents,
        retailCents,
        newCount,
        repeatCount,
      })),
    ).toEqual(EXPECTED.weeks);
  });

  it('long ranges bucket by month', () => {
    const b = timeBuckets(V, { start: '2026-01-01', end: '2026-10-15' });
    expect(b).toHaveLength(10);
    expect(b[8]).toMatchObject({ label: 'Sep 2026', serviceCents: EXPECTED.serviceCents });
  });

  it('counts sources', () => {
    const s = Object.fromEntries(sourceCounts(V).map((x) => [x.source, x.count]));
    expect(s).toEqual(EXPECTED.sources);
  });

  it('tox cadence histogram', () => {
    const b = toxCadenceBuckets(V, C);
    expect(b.map((x) => x.count)).toEqual(EXPECTED.cadenceBuckets);
    expect(b.map((x) => x.inWindow)).toEqual([false, false, true, true, false, false]);
  });

  it('category tickets and benchmark status', () => {
    const [tox, filler, bio] = categoryTickets(V, C);
    expect(tox).toMatchObject({
      visits: 6,
      avgTicketCents: EXPECTED.toxAvgTicketCents,
      chip: { text: 'Above' },
    });
    expect(filler!.avgTicketCents).toBeCloseTo(EXPECTED.fillerAvgTicketCents, 6);
    expect(filler!.chip).toMatchObject({ text: 'In range' });
    expect(bio).toMatchObject({ visits: 1, benchmark: null, chip: null });
  });

  it('product usage counts visits, not lines, and sorts by gross', () => {
    const p = productUsage(V);
    expect(
      p.map(({ productId, visits, totalQty, grossCents }) => ({ productId, visits, totalQty, grossCents })),
    ).toEqual(EXPECTED.products);
    expect(p[0]!.avgQtyPerVisit).toBe(38.4);
  });

  it('procedure mix sorted by revenue', () => {
    expect(procedureMix(V, C).map((x) => x.area)).toEqual(EXPECTED.mixOrder);
  });
});

describe('empty period', () => {
  const m = computeMetrics([], C);
  it('never divides by zero and renders dashes', () => {
    expect(m.n).toBe(0);
    for (const k of [
      'avgTicketCents',
      'retention',
      'rebookRate',
      'independence',
      'retailConversion',
      'toxCadence',
      'avgToxUnits',
      'perDay',
    ] as const)
      expect(m[k]).toBeNull();
    expect(money(m.avgTicketCents)).toBe('—');
    expect(pct(m.retention)).toBe('—');
    expect(retentionChip(m.retention)).toBeNull();
    expect(timeBuckets([], SEP)).toHaveLength(5);
  });
});

describe('months', () => {
  it('lists months newest first and defaults to the latest complete month', () => {
    const months = monthsWithVisits([
      ...SEPTEMBER_VISITS,
      { ...SEPTEMBER_VISITS[0]!, uid: 'x', date: '2026-10-03' },
    ]);
    expect(months).toEqual(['2026-10', '2026-09']);
    expect(defaultMonth(months, '2026-10-15')).toBe('2026-09');
    expect(defaultMonth(['2026-10'], '2026-10-15')).toBe('2026-10');
    expect(defaultMonth([], '2026-10-15')).toBe('2026-10');
  });

  it('six-month trend includes empty months', () => {
    const t = monthlyTrend(SEPTEMBER_VISITS, '2026-10', 6);
    expect(t.map((p) => p.ym)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(t[4]).toMatchObject({ grossCents: EXPECTED.grossCents, appointments: 10 });
    expect(t[5]!.appointments).toBe(0);
  });

  it('month-over-month deltas', () => {
    expect(delta(0.7, 0.6, 'ratio')).toEqual({ dir: 'up', text: '10 pts' });
    expect(delta(80, 100, 'count')).toEqual({ dir: 'down', text: '20%' });
    expect(delta(5, 0, 'count')).toBeNull();
    expect(delta(null, 0.5, 'ratio')).toBeNull();
  });
});
