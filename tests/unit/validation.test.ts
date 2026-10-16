import { describe, expect, it } from 'vitest';
import {
  MSG_FORMAT,
  MSG_IDENTITY,
  normalizeClientId,
  serviceGrossCents,
  validateClientId,
  validateVisit,
} from '../../src/domain/validation';
import { DEFAULT_CATALOGS, productById } from '../../src/domain/catalog';
import { daysBetween } from '../../src/domain/dates';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';

describe('client ID (PRIV-2/3, acceptance 4)', () => {
  it.each(['JOHN-01', '5551234'])('rejects %s as identity data', (raw) => {
    expect(validateClientId(raw)).toMatchObject({ ok: false, reason: 'identity', message: MSG_IDENTITY });
  });

  it('rejects jd01 (uppercased, missing dash) with the format message', () => {
    expect(validateClientId('jd01')).toMatchObject({
      ok: false,
      value: 'JD01',
      reason: 'format',
      message: MSG_FORMAT,
    });
  });

  it.each(['JD-01', 'ABC-123', ' jd-01 ', 'ch - 01'])('accepts %s', (raw) => {
    expect(validateClientId(raw).ok).toBe(true);
  });

  it('normalizes', () => {
    expect(normalizeClientId(' ch - 01 ')).toBe('CH-01');
  });

  it.each(['A-01', 'ABCD-01', 'AB-1', 'AB-1234', 'AB01', '', 'AB-0A'])('rejects %s', (raw) => {
    expect(validateClientId(raw).ok).toBe(false);
  });
});

describe('ticket math (acceptance 3)', () => {
  const botox = productById(DEFAULT_CATALOGS, 'botox')!;
  const kysse = productById(DEFAULT_CATALOGS, 'restylane-kysse')!;
  it('Botox 36u at $13 is $468; adding 1.0 mL Kysse at $750 is $1,218', () => {
    const l1 = { qty: 36, unitPriceCents: botox.defaultUnitPriceCents };
    expect(serviceGrossCents([l1])).toBe(46_800);
    expect(serviceGrossCents([l1, { qty: 1, unitPriceCents: kysse.defaultUnitPriceCents }])).toBe(121_800);
  });
  it('rounds fractional mL lines to whole cents', () => {
    expect(serviceGrossCents([{ qty: 0.3, unitPriceCents: 75_000 }])).toBe(22_500);
    expect(serviceGrossCents([{ qty: 0.1, unitPriceCents: 33_333 }])).toBe(3_333);
  });
});

describe('returning client interval (acceptance 2)', () => {
  it('2026-07-08 → 2026-10-14 is 98 days', () => {
    expect(daysBetween('2026-07-08', '2026-10-14')).toBe(98);
  });
  it('is DST-safe across November', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  });
});

describe('validateVisit', () => {
  it('accepts every fixture visit', () => {
    for (const v of SEPTEMBER_VISITS) expect(validateVisit(v)).toEqual([]);
  });
  it('rejects a visit with no products, bad id and float money', () => {
    const v = { ...SEPTEMBER_VISITS[0]!, clientId: 'JANE-01', products: [], retailCents: 1.5 };
    const errs = validateVisit(v);
    expect(errs).toContain(MSG_IDENTITY);
    expect(errs).toContain('Add at least one product with a quantity.');
    expect(errs).toContain('Retail price must be 0 or more.');
  });
  it('requires a rebook interval when rebooked', () => {
    expect(validateVisit({ ...SEPTEMBER_VISITS[0]!, rebookDays: 30 })).toContain(
      'Choose when the client rebooked for.',
    );
  });
});
