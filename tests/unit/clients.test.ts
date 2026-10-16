import { describe, expect, it } from 'vitest';
import { clientTimeline, dueForRebook, nextClientId, priorVisit } from '../../src/domain/clients';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';
import type { Visit } from '../../src/domain/types';

const base = SEPTEMBER_VISITS[0]!;
const mk = (uid: string, clientId: string, date: string, extra: Partial<Visit> = {}): Visit => ({
  ...base,
  uid,
  clientId,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  ...extra,
});

describe('priorVisit (LOG-4)', () => {
  const visits = [
    mk('a', 'CH-01', '2026-07-08'),
    mk('b', 'CH-01', '2026-05-01'),
    mk('c', 'XY-01', '2026-10-01'),
  ];
  it('finds the latest visit on or before the date', () => {
    expect(priorVisit(visits, 'CH-01', '2026-10-14')?.uid).toBe('a');
    expect(priorVisit(visits, 'CH-01', '2026-06-01')?.uid).toBe('b');
    expect(priorVisit(visits, 'CH-01', '2026-04-01')).toBeUndefined();
  });
  it('ignores the visit being edited', () => {
    expect(priorVisit(visits, 'CH-01', '2026-10-14', 'a')?.uid).toBe('b');
  });
});

describe('nextClientId (SUG-12)', () => {
  const visits = [
    mk('1', 'CH-01', '2026-09-01'),
    mk('2', 'CH-02', '2026-09-01'),
    mk('3', 'CHA-07', '2026-09-01'),
  ];
  it('suggests the next free number for the initials', () => {
    expect(nextClientId(visits, 'CH')).toBe('CH-03');
    expect(nextClientId(visits, 'ch')).toBe('CH-03');
    expect(nextClientId(visits, 'CHA')).toBe('CHA-08');
    expect(nextClientId(visits, 'ZZ')).toBe('ZZ-01');
    expect(nextClientId(visits, 'C')).toBeNull();
  });
  it('widens to three digits after 99', () => {
    expect(nextClientId([mk('1', 'AB-99', '2026-09-01')], 'AB')).toBe('AB-100');
  });
});

describe('dueForRebook (SUG-7)', () => {
  const visits = [
    mk('1', 'AA-01', '2026-06-20', { area: 'upper-face-tox', rebooked: false }), // 117 days: due
    mk('2', 'BB-01', '2026-06-20', { area: 'upper-face-tox', rebooked: true, rebookDays: 90 }), // rebooked
    mk('3', 'CC-01', '2026-06-20', { area: 'lip-filler', rebooked: false }), // not tox
    mk('4', 'DD-01', '2026-06-20', { area: 'upper-face-tox', rebooked: false }),
    mk('5', 'DD-01', '2026-09-20', { area: 'upper-face-tox', rebooked: false }), // came back: not due
    mk('6', 'EE-01', '2026-07-17', { area: 'masseter-tox', rebooked: false }), // 90 days: due
    mk('7', 'FF-01', '2026-05-01', { area: 'upper-face-tox', rebooked: false }), // 167 days: outside
  ];
  it('lists tox clients 90–120 days out who did not rebook', () => {
    expect(dueForRebook(visits, DEFAULT_CATALOGS, '2026-10-15')).toEqual([
      { clientId: 'AA-01', lastDate: '2026-06-20', daysSince: 117, area: 'upper-face-tox' },
      { clientId: 'EE-01', lastDate: '2026-07-17', daysSince: 90, area: 'masseter-tox' },
    ]);
  });
});

describe('clientTimeline', () => {
  it('summarizes a client', () => {
    const t = clientTimeline(SEPTEMBER_VISITS, 'CD-01')!;
    expect(t.visits.map((v) => v.date)).toEqual(['2026-09-02', '2026-09-09']);
    expect(t.totalServiceCents).toBe(127_000);
    expect(t.totalRetailCents).toBe(18_000);
    expect(t.rebookedCount).toBe(2);
    expect(t.avgIntervalDays).toBe(51);
  });
});
