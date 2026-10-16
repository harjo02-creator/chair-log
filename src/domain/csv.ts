/**
 * CSV export and import (DATA-1, DATA-4). RFC 4180: CRLF rows, fields quoted when they
 * contain a comma, quote or line break, quotes doubled.
 */
import { areaName } from './catalog';
import { isValidISODate, toISODate } from './dates';
import { dollarsPlain, fmtQty } from './format';
import { serviceGrossCents, validateClientId, validateVisit } from './validation';
import {
  REBOOK_DAY_OPTIONS,
  SOURCE_LABEL,
  VISIT_TYPE_LABEL,
  type Catalogs,
  type ProductLine,
  type Source,
  type Unit,
  type Visit,
  type VisitType,
} from './types';

export const CSV_COLUMNS = [
  'Date',
  'Client ID',
  'Visit Type',
  'Source',
  'Primary Treatment Area',
  'Product & Quantity',
  'Retail Add-on',
  'Retail $',
  'Est. Ticket Gross',
  'Rebooked',
  'Treatment Interval (Days)',
] as const;

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function productsLabel(lines: ProductLine[]): string {
  return lines.map((l) => `${l.nameSnapshot} ${fmtQty(l.qty, l.unit)}`).join('; ');
}

export function visitToRow(v: Visit, catalogs: Catalogs): string[] {
  return [
    v.date,
    v.clientId,
    VISIT_TYPE_LABEL[v.visitType],
    SOURCE_LABEL[v.source],
    areaName(catalogs, v.area),
    productsLabel(v.products),
    v.retailItem ?? '',
    v.retailItem ? dollarsPlain(v.retailCents) : '',
    dollarsPlain(v.serviceGrossCents),
    v.rebooked ? `Yes (${v.rebookDays} days)` : 'No',
    v.intervalDays == null ? '' : String(v.intervalDays),
  ];
}

/** Visits sorted oldest first. No BOM; use `withBom` for downloaded files so Excel reads UTF-8. */
export function visitsToCsv(visits: readonly Visit[], catalogs: Catalogs): string {
  const rows = [...visits]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((v) => visitToRow(v, catalogs));
  return (
    [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
  );
}

const BOM = String.fromCharCode(0xfeff);
export const withBom = (csv: string) => BOM + csv;

/** RFC 4180 parser. Tolerates LF-only line endings, a BOM and a trailing newline. */
export function parseCsv(text: string): string[][] {
  const s = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/* ---------- import ---------- */

export interface ImportRowResult {
  line: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  visit?: Visit;
  clientId: string;
  date: string;
}

export interface ImportReport {
  rows: ImportRowResult[];
  headerError: string | null;
  okCount: number;
  errorCount: number;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$.&]+/g, ' ')
    .trim();

/** Excel often rewrites dates; accept YYYY-MM-DD and M/D/YYYY. */
export function parseDateCell(s: string): string | null {
  const t = s.trim();
  if (isValidISODate(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const iso = toISODate(new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}

export function parseMoneyCell(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '');
  if (t === '') return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

const VISIT_TYPE_BY_TEXT: Record<string, VisitType> = {
  'new consult': 'NEW_CONSULT',
  new: 'NEW_CONSULT',
  'new consultation': 'NEW_CONSULT',
  repeat: 'REPEAT',
  returning: 'REPEAT',
};
const SOURCE_BY_TEXT: Record<string, Source> = {
  'clinic lead': 'CLINIC_LEAD',
  clinic: 'CLINIC_LEAD',
  'self sourced': 'SELF_SOURCED',
  self: 'SELF_SOURCED',
  'word of mouth': 'REFERRAL',
  referral: 'REFERRAL',
  'referral word of mouth': 'REFERRAL',
};
const UNIT_BY_TEXT: Record<string, Unit> = {
  u: 'u',
  unit: 'u',
  units: 'u',
  ml: 'mL',
  cc: 'mL',
  vial: 'vial',
  vials: 'vial',
  syr: 'syr',
  syringe: 'syr',
  syringes: 'syr',
};

/** "Botox 36u" / "Restylane Kysse 1.0mL" / "Sculptra 2 vial" → product line at catalog price. */
export function parseProductItem(item: string, catalogs: Catalogs): ProductLine | string {
  const m = /^(.*?)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/.exec(item.trim());
  if (!m) return `Can't read product "${item}".`;
  const name = norm(m[1]!);
  const product = catalogs.products.find((p) => norm(p.name) === name);
  if (!product) return `Unknown product "${m[1]}". Add it in Settings first.`;
  const unit = m[3] ? UNIT_BY_TEXT[m[3].toLowerCase()] : product.unit;
  if (unit && unit !== product.unit) return `${product.name} is measured in ${product.unit}, not ${m[3]}.`;
  const qty = Number(m[2]);
  if (!(qty > 0)) return `${product.name} needs a quantity above 0.`;
  return {
    productId: product.id,
    nameSnapshot: product.name,
    unit: product.unit,
    qty,
    unitPriceCents: product.defaultUnitPriceCents,
  };
}

export function importCsv(
  text: string,
  catalogs: Catalogs,
  opts: { now: string; newId: () => string },
): ImportReport {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(norm);
  const idx = CSV_COLUMNS.map((c) => header.indexOf(norm(c)));
  const missing = CSV_COLUMNS.filter((_, i) => idx[i] === -1);
  if (!rows.length || missing.length)
    return {
      rows: [],
      headerError: rows.length
        ? `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. The first row must have the export column names.`
        : 'The file is empty.',
      okCount: 0,
      errorCount: 0,
    };

  const out: ImportRowResult[] = rows.slice(1).map((cells, i) => {
    const get = (k: number) => (cells[idx[k]!] ?? '').trim();
    const errors: string[] = [];
    const warnings: string[] = [];

    const date = parseDateCell(get(0));
    if (!date) errors.push(`Date "${get(0)}" is not a date (use YYYY-MM-DD).`);

    const id = validateClientId(get(1));
    if (!id.ok) errors.push(id.message);

    const visitType = VISIT_TYPE_BY_TEXT[norm(get(2))];
    if (!visitType) errors.push(`Visit type "${get(2)}" should be New Consult or Repeat.`);

    const source = SOURCE_BY_TEXT[norm(get(3))];
    if (!source) errors.push(`Source "${get(3)}" should be Clinic Lead, Self-Sourced or Referral.`);

    const area = catalogs.areas.find((a) => norm(a.name) === norm(get(4)));
    if (!area) errors.push(`Unknown treatment area "${get(4)}".`);

    const products: ProductLine[] = [];
    const items = get(5)
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) errors.push('Add at least one product with a quantity.');
    for (const it of items) {
      const r = parseProductItem(it, catalogs);
      if (typeof r === 'string') errors.push(r);
      else products.push(r);
    }

    // Retail must be a catalog item: the column is not allowed to carry free text (PRIV-1).
    const retailCell = get(6);
    const retailItem = retailCell ? catalogs.retail.find((r) => norm(r.name) === norm(retailCell)) : null;
    if (retailCell && !retailItem)
      errors.push(`Unknown retail item "${retailCell}". Add it in Settings first.`);
    const retailName = retailItem?.name ?? '';
    const retailCents = parseMoneyCell(get(7));
    if (retailCents == null) errors.push(`Retail $ "${get(7)}" is not a number.`);

    const grossCell = get(8);
    const grossCents = grossCell === '' ? null : parseMoneyCell(grossCell);
    if (grossCents == null && grossCell !== '')
      errors.push(`Est. Ticket Gross "${grossCell}" is not a number.`);
    // Product lines start at catalog prices. If the sheet's gross differs and there is a single line,
    // back out the price per unit so the imported ticket matches the sheet.
    if (grossCents != null && products.length && serviceGrossCents(products) !== grossCents) {
      if (products.length === 1) products[0]!.unitPriceCents = Math.round(grossCents / products[0]!.qty);
      else warnings.push('Ticket gross differs from catalog prices; used catalog prices per product.');
    }

    const rb = norm(get(9));
    let rebooked = false;
    let rebookDays: number | null = null;
    const rbm = /^yes(?: (\d+)(?: days?)?)?$/.exec(rb);
    if (rbm) {
      rebooked = true;
      rebookDays = rbm[1] ? Number(rbm[1]) : 90;
      if (!rbm[1]) warnings.push('Rebooked without a time frame; assumed 90 days.');
      if (!(REBOOK_DAY_OPTIONS as readonly number[]).includes(rebookDays))
        errors.push(`Rebook of ${rebookDays} days isn't an option (14, 42, 90, 120, 180, 365).`);
    } else if (rb !== 'no' && rb !== '')
      errors.push(`Rebooked "${get(9)}" should be "Yes (90 days)" or "No".`);

    const iv = get(10);
    const intervalDays = iv === '' ? null : /^\d+$/.test(iv) ? Number(iv) : NaN;
    if (Number.isNaN(intervalDays)) errors.push(`Interval "${iv}" should be a whole number of days.`);

    const base = { line: i + 2, clientId: id.value, date: date ?? get(0) };
    if (errors.length) return { ...base, ok: false, errors, warnings };

    const visit: Visit = {
      uid: opts.newId(),
      date: date!,
      clientId: id.value,
      visitType: visitType!,
      source: source!,
      area: area!.id,
      products,
      retailItem: retailName || null,
      retailCents: retailName ? retailCents! : 0,
      serviceGrossCents: serviceGrossCents(products),
      rebooked,
      rebookDays,
      intervalDays: intervalDays as number | null,
      isSample: false,
      createdAt: opts.now,
      updatedAt: opts.now,
    };
    const vErrors = validateVisit(visit);
    if (vErrors.length) return { ...base, ok: false, errors: vErrors, warnings };
    return { ...base, ok: true, errors: [], warnings, visit };
  });

  return {
    rows: out,
    headerError: null,
    okCount: out.filter((r) => r.ok).length,
    errorCount: out.filter((r) => !r.ok).length,
  };
}
