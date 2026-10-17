import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import {
  deleteMonthRecord,
  importMonthRecords,
  nowISO,
  saveMonthRecord,
  ValidationError,
} from '../../db/repo';
import { withBom } from '../../domain/csv';
import { addMonths, monthOf, todayISO } from '../../domain/dates';
import { centsToInput, dollarsPlain, monthName, monthShort, parseDollars } from '../../domain/format';
import {
  emptyMonthRecord,
  importMonthCsv,
  MONTH_CSV_COLUMNS,
  MONTH_FIELDS,
  monthRecordsToCsv,
  type MonthImportReport,
  type MonthRecord,
} from '../../domain/monthRecords';
import { downloadFile } from '../../pwa/files';
import { ConfirmButton } from '../../components/ui';

type Draft = Record<(typeof MONTH_FIELDS)[number]['key'], string>;

const toDraft = (r: MonthRecord): Draft =>
  Object.fromEntries(
    MONTH_FIELDS.map((f) => {
      const v = r[f.key];
      return [f.key, v == null ? '' : f.money ? centsToInput(v) : String(v)];
    }),
  ) as Draft;

const HELP: Partial<Record<keyof Draft, string>> = {
  newClients: 'First visit with you',
  returningClients: 'Had seen you before',
  combo: 'Tox and filler in one visit',
  serviceCents: 'Service fees, no retail',
  retailCents: 'Skincare and products',
};

/** Month-level numbers: estimates for months not logged visit by visit, plus days out and models. */
export function MonthsPage() {
  const { monthRecords } = useData();
  const toast = useToast();
  const today = todayISO();
  const current = monthOf(today);
  const [month, setMonth] = useState(() => addMonths(current, -1));
  const rec = monthRecords.find((r) => r.month === month) ?? emptyMonthRecord(month, '');
  const [draft, setDraft] = useState<Draft>(() => toDraft(rec));
  const [isEstimate, setIsEstimate] = useState(rec.isEstimate);
  const [errors, setErrors] = useState<string[]>([]);
  const [report, setReport] = useState<MonthImportReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Load the chosen month into the form whenever the month or its saved record changes.
  const recKey = `${month}|${rec.updatedAt}`;
  useEffect(() => {
    setDraft(toDraft(rec));
    setIsEstimate(rec.isEstimate);
    setErrors([]);
  }, [recKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = [
    ...new Set([
      ...Array.from({ length: 18 }, (_, i) => addMonths(current, -i)),
      ...monthRecords.map((r) => r.month),
    ]),
  ]
    .sort()
    .reverse();
  const sorted = [...monthRecords].sort((a, b) => b.month.localeCompare(a.month));

  const save = async () => {
    const out: MonthRecord = { ...emptyMonthRecord(month, nowISO()), isEstimate };
    const errs: string[] = [];
    for (const f of MONTH_FIELDS) {
      const raw = draft[f.key].trim();
      if (raw === '') continue;
      if (f.money) {
        const c = parseDollars(raw);
        if (c == null) errs.push(`${f.label}: enter a dollar amount like 15995.16.`);
        else out[f.key] = c;
      } else if (!/^\d+$/.test(raw.replace(/,/g, ''))) errs.push(`${f.label}: enter a whole number.`);
      else out[f.key] = Number(raw.replace(/,/g, ''));
    }
    if (errs.length) return setErrors(errs);
    try {
      await saveMonthRecord(out);
      setErrors([]);
      toast.show(`Saved ${monthName(month)}`);
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.errors : [String(e)]);
    }
  };

  return (
    <div className="settings">
      <div>
        <div className="eyebrow">Settings</div>
        <h2 style={{ fontSize: 30 }}>Monthly totals</h2>
        <p className="small" style={{ maxWidth: '65ch' }}>
          For months you didn’t log visit by visit, enter your best numbers here; they show as estimates on
          Insights and Employer value. Days out and models always come from here. Leave anything you don’t
          know blank: blank means “not recorded”, not zero.
        </p>
      </div>

      <section className="panel" aria-labelledby="month-form-title">
        <h2 id="month-form-title">Edit a month</h2>
        <form
          ref={formRef}
          className="month-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="m-month">Month</label>
            <select id="m-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {options.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                  {monthRecords.some((r) => r.month === m) ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="month-grid">
            {MONTH_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`m-${f.key}`}>{f.label}</label>
                {f.money ? (
                  <div className="affix prefix">
                    <span aria-hidden="true">$</span>
                    <input
                      id={`m-${f.key}`}
                      inputMode="decimal"
                      value={draft[f.key]}
                      aria-describedby={HELP[f.key] ? `m-${f.key}-h` : undefined}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    />
                  </div>
                ) : (
                  <input
                    id={`m-${f.key}`}
                    inputMode="numeric"
                    value={draft[f.key]}
                    aria-describedby={HELP[f.key] ? `m-${f.key}-h` : undefined}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                )}
                {HELP[f.key] && (
                  <span className="hint" id={`m-${f.key}-h`}>
                    {HELP[f.key]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={isEstimate} onChange={(e) => setIsEstimate(e.target.checked)} />
            These are my estimates (not counted from a booking system)
          </label>
          {errors.length > 0 && (
            <div role="alert">
              {errors.map((e) => (
                <p key={e} className="error">
                  {e}
                </p>
              ))}
            </div>
          )}
          <div className="actions">
            <button type="submit" className="btn primary">
              Save {monthShort(month)}
            </button>
            {monthRecords.some((r) => r.month === month) && (
              <ConfirmButton
                label={`Delete ${monthShort(month)}`}
                confirmLabel="Tap again to delete"
                onConfirm={() =>
                  void deleteMonthRecord(month).then(() => toast.show(`Deleted ${monthName(month)} totals`))
                }
              />
            )}
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="month-list-title">
        <h2 id="month-list-title">All months</h2>
        {sorted.length === 0 ? (
          <p className="small muted">No monthly totals yet.</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Monthly totals">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  {MONTH_FIELDS.map((f) => (
                    <th key={f.key} className="r">
                      {f.label}
                    </th>
                  ))}
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.month}>
                    <td>
                      <button
                        type="button"
                        className="btn link"
                        onClick={() => {
                          setMonth(r.month);
                          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        {monthShort(r.month)}
                      </button>
                    </td>
                    {MONTH_FIELDS.map((f) => {
                      const v = r[f.key];
                      return (
                        <td key={f.key} className={`r mono ${v == null ? 'muted' : ''}`}>
                          {v == null
                            ? '—'
                            : f.money
                              ? `$${Number(dollarsPlain(v)).toLocaleString('en-US')}`
                              : v}
                        </td>
                      );
                    })}
                    <td>{r.isEstimate ? 'Estimate' : 'Counted'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="month-csv-title">
        <h2 id="month-csv-title">Upload or download</h2>
        <p className="small">
          Upload a spreadsheet with one row per month. It needs a Month column (2026-04 or April 2026); the
          other columns are optional: {MONTH_CSV_COLUMNS.slice(1).join(', ')}. Blank cells keep what’s already
          saved.
        </p>
        <div className="field">
          <label htmlFor="month-csv">Monthly totals file (.csv)</label>
          <input
            ref={fileInput}
            id="month-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReport(f ? importMonthCsv(await f.text(), { now: nowISO(), today }) : null);
            }}
          />
        </div>
        {report &&
          (report.headerError ? (
            <p className="error" role="alert">
              {report.headerError}
            </p>
          ) : (
            <div className="callout" role="status" style={{ display: 'grid' }}>
              <p>
                <b>{report.okCount}</b> month{report.okCount === 1 ? '' : 's'} ready,{' '}
                <b>{report.errorCount}</b> rejected.
                {report.rows.some((r) => r.ok && monthRecords.some((x) => x.month === r.month)) &&
                  ' Months already saved are updated.'}
              </p>
              {report.errorCount > 0 && (
                <ul className="small">
                  {report.rows
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.line} className="error">
                        Line {r.line} ({r.month || 'no month'}): {r.errors.join(' ')}
                      </li>
                    ))}
                </ul>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!report.okCount}
                  onClick={async () => {
                    const ok = report.rows.filter((r) => r.ok).map((r) => r.record!);
                    await importMonthRecords(ok);
                    toast.show(`Imported ${ok.length} month${ok.length === 1 ? '' : 's'}`);
                    setReport(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  Import {report.okCount} month{report.okCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          ))}
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={!monthRecords.length}
            onClick={() =>
              downloadFile(
                `aurelle-monthly-totals-${today}.csv`,
                withBom(monthRecordsToCsv(monthRecords)),
                'text/csv;charset=utf-8',
              )
            }
          >
            Download monthly totals
          </button>
        </div>
      </section>
    </div>
  );
}
