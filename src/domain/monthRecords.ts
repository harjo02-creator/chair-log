/**
 * Monthly totals: one record per month for numbers she tracks by the month rather than per visit
 * (estimates for months she didn't log visit by visit, days out of office, model appointments).
 * Pure: parsing, validation and CSV.
 */
import { csvField, parseCsv, parseMoneyCell } from './csv';
import { addMonths, monthOf } from './dates';
import { dollarsPlain } from './format';
import type { Cents, YearMonth } from './types';

export interface MonthRecord {
  /** YYYY-MM; the primary key. */
  month: YearMonth;
  appointments: number | null;
  newClients: number | null;
  returningClients: number | null;
  botox: number | null;
  filler: number | null;
  combo: number | null;
  other: number | null;
  daysOut: number | null;
  models: number | null;
  serviceCents: Cents | null;
  retailCents: Cents | null;
  /** True when the numbers are her estimates rather than counted from a booking system. */
  isEstimate: boolean;
  updatedAt: string;
  /** Sync bookkeeping; see Visit.syncedAt. */
  syncedAt?: string;
}

export type MonthCountKey =
  | 'appointments'
  | 'newClients'
  | 'returningClients'
  | 'botox'
  | 'filler'
  | 'combo'
  | 'other'
  | 'daysOut'
  | 'models';
export type MonthMoneyKey = 'serviceCents' | 'retailCents';

export const MONTH_FIELDS: readonly {
  key: MonthCountKey | MonthMoneyKey;
  label: string;
  money: boolean;
}[] = [
  { key: 'appointments', label: 'Appointments', money: false },
  { key: 'newClients', label: 'New clients', money: false },
  { key: 'returningClients', label: 'Returning clients', money: false },
  { key: 'botox', label: 'Botox', money: false },
  { key: 'filler', label: 'Filler', money: false },
  { key: 'combo', label: 'Combo', money: false },
  { key: 'other', label: 'Other', money: false },
  { key: 'daysOut', label: 'Days out', money: false },
  { key: 'models', label: 'Models', money: false },
  { key: 'serviceCents', label: 'Revenue', money: true },
  { key: 'retailCents', label: 'Retail', money: true },
];

export const MONTH_CSV_COLUMNS = ['Month', ...MONTH_FIELDS.map((f) => f.label)] as const;

/** Header aliases so a sheet like the one she keeps by hand imports without renaming columns. */
const ALIASES: Record<string, MonthCountKey | MonthMoneyKey | 'month'> = {
  month: 'month',
  appointments: 'appointments',
  'appointments per month': 'appointments',
  appts: 'appointments',
  'new clients': 'newClients',
  new: 'newClients',
  'returning clients': 'returningClients',
  returning: 'returningClients',
  botox: 'botox',
  tox: 'botox',
  filler: 'filler',
  combo: 'combo',
  'combo filler + tox': 'combo',
  'combo filler tox': 'combo',
  other: 'other',
  'days out': 'daysOut',
  'days out of office': 'daysOut',
  models: 'models',
  revenue: 'serviceCents',
  'service revenue': 'serviceCents',
  services: 'serviceCents',
  retail: 'retailCents',
  'retail revenue': 'retailCents',
  'retail & skincare': 'retailCents',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+&]+/g, ' ')
    .trim();

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * "2026-04", "April 2026", "Apr 2026", "4/2026". A bare month name ("April") takes `defaultYear`.
 */
export function parseMonthCell(s: string, defaultYear: number | null): YearMonth | null {
  const t = s.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return ym(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return ym(Number(m[2]), Number(m[1]));
  m = /^([a-z]+)\.?(?:,?\s+(\d{4}))?$/.exec(t);
  if (m) {
    const idx = MONTHS.findIndex((name) => name === m![1] || name.slice(0, 3) === m![1]);
    const year = m[2] ? Number(m[2]) : defaultYear;
    if (idx >= 0 && year != null) return ym(year, idx + 1);
  }
  return null;
}

function ym(y: number, mo: number): YearMonth | null {
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function validateMonthRecord(r: MonthRecord): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(r.month)) errors.push('Month must be YYYY-MM.');
  for (const f of MONTH_FIELDS) {
    const v = r[f.key];
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 0) errors.push(`${f.label} must be a whole number of 0 or more.`);
  }
  if (r.daysOut != null && r.daysOut > 31) errors.push('Days out can’t be more than 31.');
  if (r.newClients != null && r.returningClients != null && r.appointments != null)
    if (r.newClients + r.returningClients > r.appointments)
      errors.push('New plus returning clients can’t be more than appointments.');
  return errors;
}

export function emptyMonthRecord(month: YearMonth, now: string): MonthRecord {
  return {
    month,
    appointments: null,
    newClients: null,
    returningClients: null,
    botox: null,
    filler: null,
    combo: null,
    other: null,
    daysOut: null,
    models: null,
    serviceCents: null,
    retailCents: null,
    isEstimate: true,
    updatedAt: now,
  };
}

export interface MonthImportRow {
  line: number;
  ok: boolean;
  month: string;
  errors: string[];
  record?: MonthRecord;
}

export interface MonthImportReport {
  rows: MonthImportRow[];
  headerError: string | null;
  okCount: number;
  errorCount: number;
}

/**
 * Monthly totals CSV. Needs a Month column; every other known column is optional, and blank
 * cells stay blank (null) rather than becoming zero.
 */
export function importMonthCsv(text: string, opts: { now: string; today: string }): MonthImportReport {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const header = (rows[0] ?? []).map((h) => ALIASES[norm(h)] ?? null);
  const monthIdx = header.indexOf('month');
  if (!rows.length || monthIdx === -1)
    return {
      rows: [],
      headerError: rows.length ? 'The first row needs a "Month" column.' : 'The file is empty.',
      okCount: 0,
      errorCount: 0,
    };
  if (!header.some((h) => h && h !== 'month'))
    return {
      rows: [],
      headerError: `No known columns besides Month. Use: ${MONTH_CSV_COLUMNS.join(', ')}.`,
      okCount: 0,
      errorCount: 0,
    };

  // A bare month name means the most recent such month on or before this one.
  const currentYm = monthOf(opts.today);
  const seen = new Set<string>();
  const out: MonthImportRow[] = rows.slice(1).map((cells, i) => {
    const line = i + 2;
    const raw = (cells[monthIdx] ?? '').trim();
    const errors: string[] = [];
    let month = parseMonthCell(raw, Number(currentYm.slice(0, 4)));
    if (month && month > currentYm && !/\d{4}/.test(raw)) month = addMonths(month, -12);
    if (!month) errors.push(`Month "${raw}" isn't a month (use 2026-04 or April 2026).`);
    else if (seen.has(month)) errors.push(`${month} appears twice in the file.`);
    if (month) seen.add(month);

    const rec = emptyMonthRecord(month ?? raw, opts.now);
    header.forEach((key, c) => {
      if (!key || key === 'month') return;
      const cell = (cells[c] ?? '').trim();
      if (cell === '') return;
      const field = MONTH_FIELDS.find((f) => f.key === key)!;
      if (field.money) {
        const cents = parseMoneyCell(cell);
        if (cents == null) errors.push(`${field.label} "${cell}" is not a dollar amount.`);
        else rec[key as MonthMoneyKey] = cents;
      } else {
        const n = cell.replace(/,/g, '');
        if (!/^\d+$/.test(n)) errors.push(`${field.label} "${cell}" should be a whole number.`);
        else rec[key as MonthCountKey] = Number(n);
      }
    });
    if (!errors.length) errors.push(...validateMonthRecord(rec));
    return errors.length
      ? { line, ok: false, month: raw, errors }
      : { line, ok: true, month: rec.month, errors: [], record: rec };
  });

  return {
    rows: out,
    headerError: null,
    okCount: out.filter((r) => r.ok).length,
    errorCount: out.filter((r) => !r.ok).length,
  };
}

/** Same columns the import reads, oldest month first. */
export function monthRecordsToCsv(records: readonly MonthRecord[]): string {
  const rows = [...records]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => [
      r.month,
      ...MONTH_FIELDS.map((f) => {
        const v = r[f.key];
        return v == null ? '' : f.money ? dollarsPlain(v) : String(v);
      }),
    ]);
  return (
    [MONTH_CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') +
    '\r\n'
  );
}
