import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import {
  applyArea,
  applyClientLookup,
  applyRetail,
  applySameAsLast,
  defaultForm,
  formToVisit,
  isDirty,
  lineFor,
  ticket,
  visitToForm,
} from '../../src/domain/visitForm';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';
import type { Visit } from '../../src/domain/types';

const C = DEFAULT_CATALOGS;
const opts = { now: '2026-10-14T20:00:00.000Z', newId: () => 'new-uid' };

describe('defaults (LOG-11)', () => {
  it('starts with today, Upper Face Tox, Botox 36u and Rebooked Yes / 90 days', () => {
    const f = defaultForm(C, '2026-10-14');
    expect(f).toMatchObject({ date: '2026-10-14', area: 'upper-face-tox', rebooked: true, rebookDays: 90 });
    expect(f.lines).toMatchObject([{ productId: 'botox', qty: '36', price: '13' }]);
    expect(isDirty(f, C, '2026-10-14')).toBe(false);
  });
});

describe('ticket math (acceptance 3)', () => {
  it('$468, then $1,218 with Kysse, retail tracked separately', () => {
    let f = defaultForm(C, '2026-10-14');
    expect(ticket(f, C).serviceCents).toBe(46_800);
    f = { ...f, lines: [...f.lines, lineFor(C, 'restylane-kysse', 1)] };
    expect(ticket(f, C).serviceCents).toBe(121_800);
    f = applyRetail(f, C, 'Growth Factor Serum');
    const t = ticket(f, C);
    expect(t.serviceCents).toBe(121_800);
    expect(t.retailCents).toBe(18_000);
  });
});

describe('area defaults (LOG-6)', () => {
  it('replaces a single line and sets the rebook default', () => {
    const f = applyArea(defaultForm(C, '2026-10-14'), C, 'lip-filler');
    expect(f.lines).toMatchObject([{ productId: 'restylane-kysse', qty: '1.0', price: '750' }]);
    expect(f.rebookDays).toBe(180);
    expect(applyArea(f, C, 'biostimulator').rebookDays).toBe(42);
  });
  it('keeps a multi-line ticket', () => {
    const f0 = defaultForm(C, '2026-10-14');
    const f = { ...f0, lines: [...f0.lines, lineFor(C, 'restylane-kysse', 1)] };
    expect(applyArea(f, C, 'cheek-filler').lines).toHaveLength(2);
  });
});

describe('client lookup (LOG-4/5, acceptance 2)', () => {
  const prior: Visit = {
    ...SEPTEMBER_VISITS[0]!,
    uid: 'p',
    clientId: 'CH-01',
    date: '2026-07-08',
    source: 'REFERRAL',
  };

  it('returning client: Repeat, copies source, interval 98', () => {
    const f = applyClientLookup({ ...defaultForm(C, '2026-10-14'), clientId: 'CH-01' }, [prior]);
    expect(f).toMatchObject({ visitType: 'REPEAT', source: 'REFERRAL', interval: '98', intervalAuto: true });
  });

  it('switching to a new ID clears what the lookup filled in', () => {
    const returning = applyClientLookup({ ...defaultForm(C, '2026-10-14'), clientId: 'CH-01' }, [prior]);
    const f = applyClientLookup({ ...returning, clientId: 'CH-02' }, [prior]);
    expect(f).toMatchObject({ visitType: 'NEW_CONSULT', interval: '', intervalAuto: false });
  });

  it('keeps an interval typed by hand for a client new to the log', () => {
    const f = applyClientLookup({ ...defaultForm(C, '2026-10-14'), clientId: 'ZZ-01', interval: '120' }, [
      prior,
    ]);
    expect(f.interval).toBe('120');
  });

  it('same as last time copies area, products and rebook choice (SUG-3)', () => {
    const last: Visit = {
      ...prior,
      area: 'lip-filler',
      products: SEPTEMBER_VISITS[2]!.products,
      rebooked: false,
      rebookDays: null,
    };
    const f = applySameAsLast(defaultForm(C, '2026-10-14'), C, last);
    expect(f).toMatchObject({ area: 'lip-filler', rebooked: false });
    expect(f.lines).toMatchObject([{ productId: 'restylane-kysse', qty: '1.0' }]);
  });
});

describe('formToVisit', () => {
  it('builds a valid visit in cents with price snapshots', () => {
    const r = formToVisit({ ...defaultForm(C, '2026-10-14'), clientId: 'ch-01' }, C, opts);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.visit).toMatchObject({
      uid: 'new-uid',
      clientId: 'CH-01',
      serviceGrossCents: 46_800,
      products: [{ productId: 'botox', nameSnapshot: 'Botox', unit: 'u', qty: 36, unitPriceCents: 1300 }],
      retailItem: null,
      retailCents: 0,
      rebookDays: 90,
      intervalDays: null,
    });
  });

  it('reports field errors', () => {
    const f = { ...defaultForm(C, '2026-10-14'), clientId: 'JOHN-01', interval: '3.5' };
    f.lines = [{ ...f.lines[0]!, qty: '0' }];
    const r = formToVisit(f, C, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['clientId', 'interval', 'products']);
  });

  it('edit round-trips through the form', () => {
    const v = SEPTEMBER_VISITS[9]!;
    const r = formToVisit(visitToForm(v), C, opts);
    if (!r.ok) throw new Error('invalid');
    expect({ ...r.visit, updatedAt: v.updatedAt }).toEqual(v);
  });
});
