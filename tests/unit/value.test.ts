import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { importMonthCsv } from '../../src/domain/monthRecords';
import { buildValue, valuePitch, type ValueMetric } from '../../src/domain/value';
import { EXPECTED, SEPTEMBER_VISITS } from '../fixtures/september-2026';

const C = DEFAULT_CATALOGS;
const get = (list: ValueMetric[], key: string) => list.find((m) => m.key === key)!;
const text = (m: Parameters<typeof valuePitch>[0]) =>
  valuePitch(m)
    .map((p) => p.text)
    .join('');

describe('Employer Value from logged visits', () => {
  const m = buildValue(SEPTEMBER_VISITS, [], C, '2026-09', 6);

  it('reports the three employer metrics from the hand-checked month', () => {
    expect(get(m.volume, 'uniqueClients')).toMatchObject({
      value: EXPECTED.uniqueClients,
      status: 'tracked',
    });
    expect(get(m.volume, 'appointments')).toMatchObject({ value: 10, status: 'tracked' });
    expect(get(m.retention, 'retention').value).toBe(EXPECTED.retention);
    expect(get(m.retention, 'rebook')).toMatchObject({ value: EXPECTED.rebookRate, display: '70%' });
    expect(get(m.retention, 'toxReturn')).toMatchObject({ value: 0.4, sub: '2 of 5 repeat tox visits' });
    // Average spend per ticket includes retail: $8,874 ÷ 10.
    expect(get(m.revenue, 'avgTicket')).toMatchObject({ value: 88_740, display: '$887' });
    expect(get(m.revenue, 'annual')).toMatchObject({ value: 10_648_800, display: '$106,488' });
    expect(get(m.revenue, 'retailShare').display).toBe('4%');
  });

  it('only counts months with data toward the annual projection', () => {
    expect(m.points.filter((p) => p.source === 'none')).toHaveLength(5);
    expect(get(m.revenue, 'annual').sub).toMatch(/from 1 month$/);
  });

  it('writes a pitch without an estimates note', () => {
    expect(text(m)).toBe(
      'Over the last 6 months I completed 10 appointments for 8 clients at an average ticket of $887. That puts me on pace for about $106,488 a year in gross billing. 63% of my clients come back to me, and I rebook 70% at checkout.',
    );
  });
});

describe('Employer Value from monthly estimates', () => {
  const recs = importMonthCsv(
    'Month,Appointments,Days out,Revenue\n2026-04,30,0,"$12,000.50"\n2026-05,50,2,"$15,000.00"\n2026-09,40,5,\n',
    { now: '', today: '2026-10-17' },
  ).rows.map((r) => r.record!);
  const m = buildValue([], recs, C, '2026-09', 6);

  it('adds up what exists and marks what is missing', () => {
    expect(m.usesEstimates).toBe(true);
    expect(get(m.volume, 'appointments')).toMatchObject({ value: 120, status: 'estimate' });
    expect(get(m.volume, 'uniqueClients')).toMatchObject({ value: null, status: 'missing' });
    expect(get(m.retention, 'retention').status).toBe('missing');
    expect(get(m.retention, 'rebook').status).toBe('missing');
  });

  it('works out ticket and annual billing from months with revenue, flagging the gap', () => {
    const ticket = get(m.revenue, 'avgTicket');
    expect(ticket.value).toBeCloseTo(2_700_050 / 80);
    expect(ticket).toMatchObject({ display: '$338', status: 'partial', missing: ['Sep 2026'] });
    expect(get(m.revenue, 'annual')).toMatchObject({ value: 16_200_300, display: '$162,003' });
    expect(get(m.revenue, 'retailShare').status).toBe('missing');
  });

  it('says so in the pitch', () => {
    expect(text(m)).toBe(
      'Over the last 6 months I completed 120 appointments at an average ticket of $338. That puts me on pace for about $162,003 a year in gross billing. Some months are my own estimates.',
    );
  });

  it('has no data when the window is empty', () => {
    expect(buildValue([], [], C, '2026-09', 6).hasData).toBe(false);
  });
});
