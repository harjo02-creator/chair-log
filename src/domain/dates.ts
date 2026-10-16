import type { ISODate, YearMonth } from './types';

const DAY_MS = 86_400_000;

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

/** Whole calendar days from a to b (DST-safe). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / DAY_MS);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function monthOf(s: ISODate): YearMonth {
  return s.slice(0, 7);
}

export function monthStart(ym: YearMonth): ISODate {
  return `${ym}-01`;
}

export function monthEnd(ym: YearMonth): ISODate {
  const [y, m] = ym.split('-').map(Number);
  return toISODate(new Date(y!, m!, 0));
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, m! - 1 + n, 1);
  return toISODate(d).slice(0, 7);
}

/** Monday on or before the given date. */
export function weekStart(s: ISODate): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export function inRange(date: ISODate, r: DateRange): boolean {
  return date >= r.start && date <= r.end;
}

export function monthRange(ym: YearMonth): DateRange {
  return { start: monthStart(ym), end: monthEnd(ym) };
}

/** The window of `months` whole months ending with `ym` (inclusive). */
export function rollingRange(ym: YearMonth, months: number): DateRange {
  return { start: monthStart(addMonths(ym, -(months - 1))), end: monthEnd(ym) };
}

/** Months (YYYY-MM) covered by a range, oldest first. */
export function monthsInRange(r: DateRange): YearMonth[] {
  const out: YearMonth[] = [];
  for (let m = monthOf(r.start); m <= monthOf(r.end); m = addMonths(m, 1)) out.push(m);
  return out;
}
