import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../../src/domain/pin';
import { makeSampleVisits } from '../../src/db/sample';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { validateVisit } from '../../src/domain/validation';

describe('PIN lock (SUG-1)', () => {
  it('verifies the right PIN and rejects others', async () => {
    const rec = await hashPin('2468', 1000);
    expect(rec.hashB64).not.toContain('2468');
    expect(await verifyPin('2468', rec)).toBe(true);
    expect(await verifyPin('2469', rec)).toBe(false);
  });
  it('rejects PINs that are not 4–6 digits', async () => {
    await expect(hashPin('12')).rejects.toThrow();
    await expect(hashPin('abcd')).rejects.toThrow();
  });
});

describe('sample data', () => {
  let i = 0;
  const visits = makeSampleVisits(DEFAULT_CATALOGS, '2026-10-15', { newId: () => `s${++i}`, now: 'x' });
  it('produces about 120 valid visits across the previous and current month', () => {
    expect(visits.length).toBeGreaterThan(100);
    expect(visits.length).toBeLessThan(160);
    for (const v of visits) expect(validateVisit(v)).toEqual([]);
    expect(visits[0]!.date).toBe('2026-09-01');
    expect(visits.every((v) => v.date < '2026-10-15' && v.isSample)).toBe(true);
  });
  it('never marks a client already in the log as new', () => {
    const seen = new Set<string>();
    for (const v of visits) {
      if (seen.has(v.clientId)) expect(v.visitType).toBe('REPEAT');
      seen.add(v.clientId);
    }
  });
});
