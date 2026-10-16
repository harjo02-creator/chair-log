/**
 * The Log form's state and rules (LOG-4..LOG-13, SUG-3, SUG-12) as pure functions, so the
 * React form only renders and forwards events.
 */
import { areaById, DEFAULT_AREA_ID, productById, retailByName } from './catalog';
import { priorVisit } from './clients';
import { daysBetween, isValidISODate } from './dates';
import { centsToInput, parseDollars } from './format';
import { lineGrossCents, validateClientId } from './validation';
import {
  DEFAULT_REBOOK_DAYS,
  type Catalogs,
  type ISODate,
  type ProductLine,
  type Source,
  type Unit,
  type Visit,
  type VisitType,
} from './types';

export interface LineState {
  key: number;
  productId: string;
  qty: string;
  /** Dollars as typed, e.g. "13" or "4.50". */
  price: string;
}

export interface FormState {
  /** Set when editing an existing visit. */
  uid: string | null;
  createdAt: string | null;
  isSample: boolean;
  date: ISODate;
  clientId: string;
  visitType: VisitType;
  source: Source;
  area: string;
  lines: LineState[];
  /** Retail item name, '' for none. */
  retailItem: string;
  retailPrice: string;
  rebooked: boolean;
  rebookDays: number;
  interval: string;
  /** True while the interval was filled in by the lookup rather than typed. */
  intervalAuto: boolean;
}

let lineKey = 0;
export const nextLineKey = () => ++lineKey;

export function lineFor(catalogs: Catalogs, productId: string, qty: number): LineState {
  const p = productById(catalogs, productId);
  return {
    key: nextLineKey(),
    productId,
    qty: p?.unit === 'mL' ? qty.toFixed(1) : String(qty),
    price: p ? centsToInput(p.defaultUnitPriceCents) : '0',
  };
}

function defaultLine(catalogs: Catalogs, areaId: string): LineState[] {
  const a = areaById(catalogs, areaId);
  if (!a) return [];
  return [lineFor(catalogs, a.defaultProductId, a.defaultQty)];
}

/** LOG-11 defaults: today, Upper Face Tox, Botox 36u, Rebooked Yes / 90 days. */
export function defaultForm(catalogs: Catalogs, today: ISODate): FormState {
  const area = areaById(catalogs, DEFAULT_AREA_ID)?.active
    ? DEFAULT_AREA_ID
    : (catalogs.areas.find((a) => a.active)?.id ?? DEFAULT_AREA_ID);
  return {
    uid: null,
    createdAt: null,
    isSample: false,
    date: today,
    clientId: '',
    visitType: 'NEW_CONSULT',
    source: 'CLINIC_LEAD',
    area,
    lines: defaultLine(catalogs, area),
    retailItem: '',
    retailPrice: '',
    rebooked: true,
    rebookDays: DEFAULT_REBOOK_DAYS[areaById(catalogs, area)?.category ?? 'TOX'],
    interval: '',
    intervalAuto: false,
  };
}

/** LOG-6: pre-fill the area's default product unless she already built a multi-line ticket. */
export function applyArea(f: FormState, catalogs: Catalogs, areaId: string): FormState {
  const a = areaById(catalogs, areaId);
  return {
    ...f,
    area: areaId,
    lines: f.lines.length <= 1 ? defaultLine(catalogs, areaId) : f.lines,
    rebookDays: a ? DEFAULT_REBOOK_DAYS[a.category] : f.rebookDays,
  };
}

export function applyProduct(f: FormState, catalogs: Catalogs, key: number, productId: string): FormState {
  const p = productById(catalogs, productId);
  return {
    ...f,
    lines: f.lines.map((l) =>
      l.key === key ? { ...l, productId, price: p ? centsToInput(p.defaultUnitPriceCents) : l.price } : l,
    ),
  };
}

export function applyRetail(f: FormState, catalogs: Catalogs, name: string): FormState {
  const r = retailByName(catalogs, name);
  return { ...f, retailItem: name, retailPrice: r ? centsToInput(r.defaultPriceCents) : '' };
}

export type ClientStatus =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: 'identity' | 'format' | 'empty'; message: string }
  | { kind: 'new'; suggestion: null }
  | { kind: 'returning'; prior: Visit; interval: number };

/** Lookup without changing the form (used for hints). */
export function clientStatus(f: FormState, visits: readonly Visit[]): ClientStatus {
  if (!f.clientId) return { kind: 'empty' };
  const r = validateClientId(f.clientId);
  if (!r.ok) return { kind: 'invalid', reason: r.reason, message: r.message };
  if (!isValidISODate(f.date)) return { kind: 'new', suggestion: null };
  const prior = priorVisit(visits, r.value, f.date, f.uid ?? undefined);
  return prior
    ? { kind: 'returning', prior, interval: daysBetween(prior.date, f.date) }
    : { kind: 'new', suggestion: null };
}

/**
 * LOG-4 / LOG-5: after the Client ID or date changes. A returning client sets Repeat, copies the
 * source and fills the interval. A new ID clears anything the lookup filled in before, but keeps an
 * interval she typed by hand.
 */
export function applyClientLookup(f: FormState, visits: readonly Visit[]): FormState {
  const s = clientStatus(f, visits);
  if (s.kind === 'returning')
    return {
      ...f,
      visitType: 'REPEAT',
      source: s.prior.source,
      interval: String(s.interval),
      intervalAuto: true,
    };
  if (f.intervalAuto) return { ...f, visitType: 'NEW_CONSULT', interval: '', intervalAuto: false };
  return f;
}

/** SUG-3 "Same as last time": copy area, products (at today's catalog prices) and rebook choice. */
export function applySameAsLast(f: FormState, catalogs: Catalogs, prior: Visit): FormState {
  return {
    ...f,
    area: prior.area,
    lines: prior.products.map((l) => {
      const p = productById(catalogs, l.productId);
      return {
        key: nextLineKey(),
        productId: l.productId,
        qty: l.unit === 'mL' ? l.qty.toFixed(1) : String(l.qty),
        price: centsToInput(p?.defaultUnitPriceCents ?? l.unitPriceCents),
      };
    }),
    rebooked: prior.rebooked,
    rebookDays: prior.rebookDays ?? f.rebookDays,
  };
}

export function visitToForm(v: Visit): FormState {
  return {
    uid: v.uid,
    createdAt: v.createdAt,
    isSample: v.isSample,
    date: v.date,
    clientId: v.clientId,
    visitType: v.visitType,
    source: v.source,
    area: v.area,
    lines: v.products.map((l) => ({
      key: nextLineKey(),
      productId: l.productId,
      qty: l.unit === 'mL' ? l.qty.toFixed(1) : String(l.qty),
      price: centsToInput(l.unitPriceCents),
    })),
    retailItem: v.retailItem ?? '',
    retailPrice: v.retailItem ? centsToInput(v.retailCents) : '',
    rebooked: v.rebooked,
    rebookDays: v.rebookDays ?? 90,
    interval: v.intervalDays == null ? '' : String(v.intervalDays),
    intervalAuto: false,
  };
}

/* ---------- live ticket and save ---------- */

export interface TicketLine {
  key: number;
  label: string;
  qty: number;
  unit: Unit;
  unitPriceCents: number;
  grossCents: number;
}

export interface Ticket {
  lines: TicketLine[];
  serviceCents: number;
  retailCents: number;
}

function parseQty(s: string): number {
  const n = Number(s.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Lines with qty > 0 as product lines with price snapshots. */
export function formLines(f: FormState, catalogs: Catalogs): (ProductLine & { key: number })[] {
  const out: (ProductLine & { key: number })[] = [];
  for (const l of f.lines) {
    const p = productById(catalogs, l.productId);
    const qty = parseQty(l.qty);
    if (!p || qty <= 0) continue;
    out.push({
      key: l.key,
      productId: p.id,
      nameSnapshot: p.name,
      unit: p.unit,
      qty: p.unit === 'mL' ? Math.round(qty * 10) / 10 : qty,
      unitPriceCents: parseDollars(l.price) ?? 0,
    });
  }
  return out;
}

export function lineGross(f: LineState): number {
  return lineGrossCents({ qty: parseQty(f.qty), unitPriceCents: parseDollars(f.price) ?? 0 });
}

export function ticket(f: FormState, catalogs: Catalogs): Ticket {
  const lines = formLines(f, catalogs).map((l) => ({
    key: l.key,
    label: l.nameSnapshot,
    qty: l.qty,
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
    grossCents: lineGrossCents(l),
  }));
  return {
    lines,
    serviceCents: lines.reduce((s, l) => s + l.grossCents, 0),
    retailCents: f.retailItem ? (parseDollars(f.retailPrice) ?? 0) : 0,
  };
}

export type FormErrors = Partial<
  Record<'date' | 'clientId' | 'area' | 'products' | 'retailPrice' | 'interval', string>
>;

export type ToVisitResult = { ok: true; visit: Visit } | { ok: false; errors: FormErrors };

export function formToVisit(
  f: FormState,
  catalogs: Catalogs,
  opts: { now: string; newId: () => string },
): ToVisitResult {
  const errors: FormErrors = {};
  if (!isValidISODate(f.date)) errors.date = 'Choose the visit date.';
  const id = validateClientId(f.clientId);
  if (!id.ok) errors.clientId = id.message;
  if (!areaById(catalogs, f.area)) errors.area = 'Choose a treatment area.';

  const lines = formLines(f, catalogs);
  if (!lines.length) errors.products = 'Add at least one product with a quantity.';
  for (const l of f.lines) {
    const p = productById(catalogs, l.productId);
    const q = parseQty(l.qty);
    if (p && q > 0 && p.unit !== 'mL' && !Number.isInteger(q))
      errors.products = `${p.name} is measured in whole ${p.unit === 'u' ? 'units' : p.unit}s.`;
    if (q > 0 && parseDollars(l.price) == null) errors.products = 'Enter a price per unit, like 13 or 4.50.';
  }

  let retailCents = 0;
  if (f.retailItem) {
    const c = parseDollars(f.retailPrice || '0');
    if (c == null) errors.retailPrice = 'Enter the retail price in dollars.';
    else retailCents = c;
  }

  let intervalDays: number | null = null;
  if (f.interval.trim() !== '') {
    if (!/^\d+$/.test(f.interval.trim())) errors.interval = 'Use a whole number of days.';
    else intervalDays = Number(f.interval.trim());
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const products = lines.map(({ key: _k, ...l }) => l);
  return {
    ok: true,
    visit: {
      uid: f.uid ?? opts.newId(),
      date: f.date,
      clientId: id.value,
      visitType: f.visitType,
      source: f.source,
      area: f.area,
      products,
      retailItem: f.retailItem || null,
      retailCents,
      serviceGrossCents: products.reduce((s, l) => s + lineGrossCents(l), 0),
      rebooked: f.rebooked,
      rebookDays: f.rebooked ? f.rebookDays : null,
      intervalDays,
      isSample: f.isSample,
      createdAt: f.createdAt ?? opts.now,
      updatedAt: opts.now,
    },
  };
}

/** True when the form differs from a fresh default form (worth keeping as a draft). */
export function isDirty(f: FormState, catalogs: Catalogs, today: ISODate): boolean {
  const d = defaultForm(catalogs, today);
  const strip = (x: FormState) => ({ ...x, lines: x.lines.map(({ key: _k, ...l }) => l) });
  return f.uid != null || JSON.stringify(strip(f)) !== JSON.stringify(strip(d));
}
