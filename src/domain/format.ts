import { parseISODate } from './dates';
import type { Cents, ISODate, Unit, YearMonth } from './types';

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** Whole dollars, e.g. $1,218. Null renders as an em dash. */
export function money(cents: Cents | null): string {
  return cents == null || !Number.isFinite(cents) ? '—' : usd0.format(Math.round(cents / 100));
}

/** Dollars with cents only when there are some, e.g. $4.50 or $13. */
export function moneyExact(cents: Cents | null): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return cents % 100 === 0 ? usd0.format(cents / 100) : usd2.format(cents / 100);
}

/** A ratio 0..1 as a whole percentage, e.g. 62%. Null renders as an em dash. */
export function pct(ratio: number | null): string {
  return ratio == null || !Number.isFinite(ratio) ? '—' : `${Math.round(ratio * 100)}%`;
}

/** Plain dollar number for CSV cells: 180 or 4.5 → "4.50". */
export function dollarsPlain(cents: Cents): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** "36u", "1.0mL", "2 vial", "1 syr" (matches the CSV product format in DATA-1). */
export function fmtQty(qty: number, unit: Unit): string {
  if (unit === 'u') return `${round1(qty)}u`;
  if (unit === 'mL') return `${qty.toFixed(1)}mL`;
  return `${round1(qty)} ${unit}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "Oct 14" */
export function fmtShortDate(s: ISODate): string {
  return parseISODate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Oct 14, 2026" */
export function fmtLongDate(s: ISODate): string {
  return parseISODate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "October 2026" */
export function monthName(ym: YearMonth): string {
  return parseISODate(`${ym}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Oct 2026" */
export function monthShort(ym: YearMonth): string {
  return parseISODate(`${ym}-01`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Dollars typed by the user ("13", "4.5", "$1,200") → integer cents, or null if not a number. */
export function parseDollars(input: string): Cents | null {
  const s = input.replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function centsToInput(cents: Cents): string {
  return dollarsPlain(cents);
}
