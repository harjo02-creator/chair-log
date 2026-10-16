import { isValidISODate } from './dates';
import { REBOOK_DAY_OPTIONS, SOURCES, UNITS, VISIT_TYPES, type ProductLine, type Visit } from './types';

export const CLIENT_ID_RE = /^[A-Z]{2,3}-\d{2,3}$/;

export const MSG_CLIENT_ID_REQUIRED = 'Client ID is required, like CH-01.';
export const MSG_IDENTITY =
  'That looks like a name or number. Use initials + client number only, like CH-01.';
export const MSG_FORMAT = 'Format: 2–3 initials, a dash, then a client number (CH-01).';

export type ClientIdResult =
  | { ok: true; value: string }
  | { ok: false; value: string; reason: 'empty' | 'identity' | 'format'; message: string };

/** Auto-uppercase and strip spaces (LOG-3). */
export function normalizeClientId(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

/** PRIV-2 / PRIV-3. Identity-looking input is checked first so the stronger warning wins. */
export function validateClientId(raw: string): ClientIdResult {
  const value = normalizeClientId(raw);
  if (!value) return { ok: false, value, reason: 'empty', message: MSG_CLIENT_ID_REQUIRED };
  if (/[A-Z]{4,}/.test(value) || /\d{4,}/.test(value))
    return { ok: false, value, reason: 'identity', message: MSG_IDENTITY };
  if (!CLIENT_ID_RE.test(value)) return { ok: false, value, reason: 'format', message: MSG_FORMAT };
  return { ok: true, value };
}

export function lineGrossCents(line: Pick<ProductLine, 'qty' | 'unitPriceCents'>): number {
  return Math.round(line.qty * line.unitPriceCents);
}

export function serviceGrossCents(lines: Pick<ProductLine, 'qty' | 'unitPriceCents'>[]): number {
  return lines.reduce((s, l) => s + lineGrossCents(l), 0);
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * Full structural check of a visit. Used before every save and on backup/CSV import,
 * so nothing that breaks the privacy rules or the money invariants reaches the database.
 */
export function validateVisit(v: Visit): string[] {
  const errors: string[] = [];
  if (typeof v.uid !== 'string' || !v.uid) errors.push('Missing id.');
  if (typeof v.date !== 'string' || !isValidISODate(v.date)) errors.push('Date must be YYYY-MM-DD.');
  const id = validateClientId(typeof v.clientId === 'string' ? v.clientId : '');
  if (!id.ok || id.value !== v.clientId) errors.push(id.ok ? MSG_FORMAT : id.message);
  if (!VISIT_TYPES.includes(v.visitType)) errors.push('Unknown visit type.');
  if (!SOURCES.includes(v.source)) errors.push('Unknown source.');
  if (typeof v.area !== 'string' || !v.area) errors.push('Treatment area is required.');
  if (!Array.isArray(v.products) || v.products.length === 0)
    errors.push('Add at least one product with a quantity.');
  else
    v.products.forEach((p, i) => {
      if (!p || typeof p.productId !== 'string' || typeof p.nameSnapshot !== 'string')
        errors.push(`Product ${i + 1} is missing its name.`);
      else if (!UNITS.includes(p.unit)) errors.push(`Product ${i + 1} has an unknown unit.`);
      else if (!(typeof p.qty === 'number' && p.qty > 0 && Number.isFinite(p.qty)))
        errors.push(`Product ${i + 1} needs a quantity above 0.`);
      else if (!isInt(p.unitPriceCents) || p.unitPriceCents < 0)
        errors.push(`Product ${i + 1} has an invalid price.`);
    });
  if (v.retailItem !== null && typeof v.retailItem !== 'string') errors.push('Invalid retail item.');
  if (!isInt(v.retailCents) || v.retailCents < 0) errors.push('Retail price must be 0 or more.');
  if (!isInt(v.serviceGrossCents) || v.serviceGrossCents < 0) errors.push('Invalid ticket gross.');
  if (typeof v.rebooked !== 'boolean') errors.push('Rebooked must be yes or no.');
  if (v.rebooked && !(REBOOK_DAY_OPTIONS as readonly number[]).includes(v.rebookDays ?? -1))
    errors.push('Choose when the client rebooked for.');
  if (v.intervalDays !== null && (!isInt(v.intervalDays) || v.intervalDays < 0))
    errors.push('Interval must be a whole number of days.');
  if (typeof v.isSample !== 'boolean') errors.push('Invalid sample flag.');
  return errors;
}
