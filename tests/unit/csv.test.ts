import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvField, importCsv, parseCsv, visitsToCsv, withBom } from '../../src/domain/csv';
import { DEFAULT_CATALOGS } from '../../src/domain/catalog';
import { MSG_FORMAT, MSG_IDENTITY } from '../../src/domain/validation';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';

const C = DEFAULT_CATALOGS;
let i = 0;
const opts = { now: '2026-10-15T00:00:00.000Z', newId: () => `imp-${++i}` };

describe('CSV export (DATA-1, acceptance 8)', () => {
  const csv = visitsToCsv(SEPTEMBER_VISITS, C);
  const lines = csv.split('\r\n');

  it('has exactly the spec columns', () => {
    expect(lines[0]).toBe(
      'Date,Client ID,Visit Type,Source,Primary Treatment Area,Product & Quantity,Retail Add-on,Retail $,Est. Ticket Gross,Rebooked,Treatment Interval (Days)',
    );
    expect(parseCsv(csv)[0]).toEqual([...CSV_COLUMNS]);
  });

  it('formats products, money, rebook and interval', () => {
    expect(lines[1]).toBe(
      '2026-09-02,AB-01,New Consult,Clinic Lead,Upper Face Tox,Botox 36u,,,468,Yes (90 days),',
    );
    expect(lines[2]).toBe(
      '2026-09-02,CD-01,Repeat,Self-Sourced,Upper Face Tox,Botox 40u,Growth Factor Serum,180,520,Yes (90 days),95',
    );
    expect(lines[10]).toBe(
      '2026-09-30,RS-01,Repeat,Self-Sourced,Upper Face Tox,Botox 36u; Restylane Kysse 1.0mL,,,1218,Yes (90 days),110',
    );
    expect(lines).toContain(
      '2026-09-12,JK-01,New Consult,Clinic Lead,Biostimulator,Sculptra 2 vial,Tinted Mineral SPF 46,58,1800,Yes (42 days),',
    );
    expect(lines).toContain('2026-09-12,GH-01,Repeat,Clinic Lead,Upper Face Tox,Dysport 60u,,,270,No,130');
  });

  it('quotes per RFC 4180', () => {
    expect(csvField('Chin & Jawline Filler')).toBe('Chin & Jawline Filler');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('ends rows with CRLF', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.includes('\n') && !/[^\r]\n/.test(csv)).toBe(true);
  });
});

describe('CSV import (DATA-4)', () => {
  it('round-trips the export', () => {
    const r = importCsv(visitsToCsv(SEPTEMBER_VISITS, C), C, opts);
    expect(r.headerError).toBeNull();
    expect(r.errorCount).toBe(0);
    expect(r.okCount).toBe(10);
    const gross = r.rows.reduce((s, x) => s + x.visit!.serviceGrossCents, 0);
    expect(gross).toBe(851_600);
    expect(r.rows[1]!.visit).toMatchObject({
      clientId: 'CD-01',
      retailItem: 'Growth Factor Serum',
      retailCents: 18_000,
      intervalDays: 95,
      rebookDays: 90,
    });
  });

  it('imports a downloaded file that starts with a byte-order mark', () => {
    expect(importCsv(withBom(visitsToCsv(SEPTEMBER_VISITS, C)), C, opts).okCount).toBe(10);
  });

  it('reports bad rows by line and rejects identity data', () => {
    const csv = [
      CSV_COLUMNS.join(','),
      '2026-09-01,JOHN-01,New Consult,Clinic Lead,Upper Face Tox,Botox 36u,,,468,No,',
      '2026-09-01,jd01,New Consult,Clinic Lead,Upper Face Tox,Botox 36u,,,468,No,',
      '9/2/2026,JD-01,Repeat,Referral,Lip Filler,Restylane Kysse 1.0mL,,,800,Yes (180 days),120',
      '2026-09-03,KL-02,New Consult,Clinic Lead,Upper Face Tox,Mystery 10u,Free text note,,0,Maybe,abc',
    ].join('\n');
    const r = importCsv(csv, C, opts);
    expect(r.okCount).toBe(1);
    expect(r.rows[0]).toMatchObject({ line: 2, ok: false, errors: [MSG_IDENTITY] });
    expect(r.rows[1]).toMatchObject({ line: 3, ok: false, errors: [MSG_FORMAT] });
    // Single line whose sheet gross differs from catalog price: price per unit is backed out.
    expect(r.rows[2]!.visit).toMatchObject({ date: '2026-09-02', serviceGrossCents: 80_000 });
    expect(r.rows[2]!.visit!.products[0]!.unitPriceCents).toBe(80_000);
    expect(r.rows[3]!.errors).toEqual([
      'Unknown product "Mystery". Add it in Settings first.',
      'Unknown retail item "Free text note". Add it in Settings first.',
      'Rebooked "Maybe" should be "Yes (90 days)" or "No".',
      'Interval "abc" should be a whole number of days.',
    ]);
  });

  it('explains a wrong header', () => {
    expect(importCsv('Name,Phone\nJane,555', C, opts).headerError).toMatch(
      /^Missing columns: Date, Client ID/,
    );
  });
});
