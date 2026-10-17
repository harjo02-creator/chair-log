import { useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { SCHEMA_VERSION } from '../../db/db';
import { importVisits, newId, nowISO, restoreBackup } from '../../db/repo';
import { parseBackup, previewBackup, type Backup } from '../../domain/backup';
import { importCsv, rejectDuplicates, visitsToCsv, withBom, type ImportReport } from '../../domain/csv';
import { todayISO } from '../../domain/dates';
import { fmtLongDate, monthShort } from '../../domain/format';
import { copyText, downloadFile } from '../../pwa/files';
import { ConfirmButton } from '../../components/ui';
import { BackupNowButton } from './backupActions';

/** DATA-1..DATA-5 */
export function DataSection() {
  const { visits, catalogs, settings } = useData();
  const toast = useToast();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const preview = backup ? previewBackup(backup) : null;

  const doRestore = async (mode: 'merge' | 'replace') => {
    if (!backup) return;
    const n = await restoreBackup(backup, mode);
    toast.show(`${mode === 'merge' ? 'Merged' : 'Restored'}. ${n} visits in the log.`);
    setBackup(null);
    if (backupInput.current) backupInput.current.value = '';
  };

  return (
    <>
      <section className="panel" aria-labelledby="backup-title" id="backup">
        <h2 id="backup-title">Backup &amp; restore</h2>
        <p className="small">
          A backup is one file with every visit, your price lists and settings. On a phone, save it to Files,
          iCloud Drive or Google Drive. Last backup:{' '}
          <b>{settings.lastBackupAt ? fmtLongDate(settings.lastBackupAt.slice(0, 10)) : 'never'}</b>.
        </p>
        <div className="actions">
          <BackupNowButton primary />
        </div>
        <div className="field">
          <label htmlFor="restore-file">Restore from a backup file (.json)</label>
          <input
            ref={backupInput}
            id="restore-file"
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              setBackup(null);
              setRestoreError('');
              const f = e.target.files?.[0];
              if (!f) return;
              const r = parseBackup(await f.text(), SCHEMA_VERSION);
              if (r.ok) setBackup(r.backup);
              else setRestoreError(r.error);
            }}
          />
          {restoreError && (
            <span className="error" role="alert">
              {restoreError}
            </span>
          )}
        </div>
        {preview && (
          <div className="callout" role="status">
            <span>
              <b>
                {preview.visits} visits
                {preview.firstMonth &&
                  `, ${monthShort(preview.firstMonth)} – ${monthShort(preview.lastMonth!)}`}
              </b>
              {preview.sampleVisits > 0 && ` (${preview.sampleVisits} sample)`}
              {preview.exportedAt && `. Backed up ${fmtLongDate(preview.exportedAt.slice(0, 10))}.`}
            </span>
            <button type="button" className="btn small" onClick={() => void doRestore('merge')}>
              Merge with this device
            </button>
            <ConfirmButton
              label={`Replace all ${visits.length} visits`}
              confirmLabel="Tap again to replace"
              onConfirm={() => void doRestore('replace')}
            />
          </div>
        )}
        <p className="hint">
          Merge keeps everything on this device and adds visits from the file. Replace deletes this device's
          log first.
        </p>
      </section>

      <section className="panel" aria-labelledby="csv-title">
        <h2 id="csv-title">Spreadsheet (CSV)</h2>
        <p className="small">
          Export the whole log for Excel or Google Sheets, or import your existing spreadsheet.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={!visits.length}
            onClick={() =>
              downloadFile(
                `aurelle-all-${todayISO()}.csv`,
                withBom(visitsToCsv(visits, catalogs)),
                'text/csv;charset=utf-8',
              )
            }
          >
            Download all as CSV
          </button>
          <button
            type="button"
            className="btn"
            disabled={!visits.length}
            onClick={async () =>
              toast.show(
                (await copyText(visitsToCsv(visits, catalogs)))
                  ? `${visits.length} rows copied`
                  : 'Copy was blocked. Use Download.',
              )
            }
          >
            Copy all as CSV
          </button>
        </div>
        <div className="field">
          <label htmlFor="csv-file">Import a CSV with the same columns as the export</label>
          <input
            ref={csvInput}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReport(
                f
                  ? rejectDuplicates(importCsv(await f.text(), catalogs, { now: nowISO(), newId }), visits)
                  : null,
              );
            }}
          />
          <span className="hint">
            Columns: Date, Client ID, Visit Type, Source, Primary Treatment Area, Product &amp; Quantity,
            Retail Add-on, Retail $, Est. Ticket Gross, Rebooked, Treatment Interval (Days). Rows with names
            or phone numbers are rejected, and so are rows already in the log, so uploading the same file
            twice is safe.
          </span>
        </div>
        {report && (
          <ImportReportView
            report={report}
            onImport={async () => {
              const ok = report.rows.filter((r) => r.ok).map((r) => r.visit!);
              await importVisits(ok);
              toast.show(`Imported ${ok.length} visits`);
              setReport(null);
              if (csvInput.current) csvInput.current.value = '';
            }}
          />
        )}
      </section>
    </>
  );
}

function ImportReportView({ report, onImport }: { report: ImportReport; onImport: () => void }) {
  if (report.headerError)
    return (
      <p className="error" role="alert">
        {report.headerError}
      </p>
    );
  const bad = report.rows.filter((r) => !r.ok || r.warnings.length);
  return (
    <div className="callout" role="status" style={{ display: 'grid' }}>
      <p>
        <b>{report.okCount}</b> row{report.okCount === 1 ? '' : 's'} ready to import,{' '}
        <b>{report.errorCount}</b> rejected.
      </p>
      {bad.length > 0 && (
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Import problems"
          style={{ maxHeight: 280 }}
        >
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Client</th>
                <th>Date</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {bad.map((r) => (
                <tr key={r.line}>
                  <td className="mono">{r.line}</td>
                  <td className="mono">{r.ok ? r.clientId : '(hidden)'}</td>
                  <td>{r.date}</td>
                  <td className="wrap-cell">
                    {r.errors.map((e) => (
                      <div key={e} className="error">
                        ✕ {e}
                      </div>
                    ))}
                    {r.warnings.map((w) => (
                      <div key={w} className="hint">
                        ! {w}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn primary" disabled={!report.okCount} onClick={onImport}>
          Import {report.okCount} valid row{report.okCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
