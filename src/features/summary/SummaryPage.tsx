import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/data';
import { useThemeKey } from '../../app/theme';
import { useToast } from '../../app/toast';
import { monthOf } from '../../domain/dates';
import { monthName } from '../../domain/format';
import { pitchParts, pitchText } from '../../domain/pitch';
import { buildSummary } from '../../domain/summary';
import { visitsToCsv, withBom } from '../../domain/csv';
import { copyText, downloadFile } from '../../pwa/files';
import { Empty, Segmented } from '../../components/ui';
import { SummaryCharts } from './SummaryCharts';
import { BenchmarkTable, KpiTiles, MathSection, Pitch, ProductTable } from './SummaryParts';
import { usePeriod } from './usePeriod';

export function SummaryPage() {
  const { visits, catalogs, settings } = useData();
  const toast = useToast();
  const themeKey = useThemeKey(settings.theme);
  const p = usePeriod(visits);
  const s = useMemo(
    () =>
      buildSummary(visits, catalogs, p.period, {
        rolling: p.rolling,
        rollingMonths: settings.rollingRetentionMonths,
      }),
    [visits, catalogs, p.period.range.start, p.period.range.end, p.rolling, settings.rollingRetentionMonths], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const parts = pitchParts({ ...s.m, retention: s.retentionShown.rate }, p.period.phrase);
  const csvName = `chair-log-${p.period.ym ?? `${p.period.range.start}_to_${p.period.range.end}`}.csv`;

  return (
    <>
      <div className="sum-head">
        <div>
          <div className="eyebrow">{p.mode === 'month' ? 'Monthly audit' : 'Book of business'}</div>
          <h2>{p.period.title}</h2>
        </div>
        <div className="sum-controls no-print">
          <Segmented
            legend="Period"
            name="mode"
            value={p.mode}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'ytd', label: 'Year to date' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(mode) => p.set({ mode })}
          />
          {p.mode === 'month' && (
            <div className="field">
              <label htmlFor="f-month">Month</label>
              <select id="f-month" value={p.ym} onChange={(e) => p.set({ m: e.target.value })}>
                {p.monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                    {m === p.current ? ' (in progress)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {p.mode === 'custom' && (
            <>
              <div className="field">
                <label htmlFor="f-start">From</label>
                <input
                  id="f-start"
                  type="date"
                  value={p.start}
                  onChange={(e) => e.target.value && p.set({ start: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="f-end">To</label>
                <input
                  id="f-end"
                  type="date"
                  value={p.end}
                  onChange={(e) => e.target.value && p.set({ end: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {s.m.n === 0 ? (
        <section className="panel">
          <Empty>
            <p>
              No visits logged for this {p.mode === 'month' ? 'month' : 'period'} yet. Log a visit to see the
              summary.
            </p>
            <Link className="btn primary" to="/log">
              Log a visit
            </Link>
          </Empty>
        </section>
      ) : (
        <>
          <section className="panel" aria-labelledby="pitch-title">
            <div className="eyebrow" id="pitch-title" style={{ marginBottom: 8 }}>
              30-second elevator pitch
            </div>
            <Pitch parts={parts} />
            <div className="actions no-print" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn small"
                onClick={async () =>
                  toast.show(
                    (await copyText(pitchText(parts)))
                      ? 'Pitch copied'
                      : 'Copy was blocked. Select the text and copy it by hand.',
                  )
                }
              >
                Copy pitch
              </button>
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  const ok = await copyText(visitsToCsv(s.V, catalogs));
                  toast.show(
                    ok
                      ? `${s.V.length} rows copied. Paste into a spreadsheet.`
                      : 'Copy was blocked. Use Download CSV.',
                  );
                }}
              >
                Copy {p.mode === 'month' ? 'month' : 'period'} as CSV
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  downloadFile(csvName, withBom(visitsToCsv(s.V, catalogs)), 'text/csv;charset=utf-8')
                }
              >
                Download CSV
              </button>
              <Link className="btn small" to={`/report?${p.query}`}>
                Book of Business one-pager
              </Link>
            </div>
          </section>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Segmented
              legend="Retention window"
              name="ret"
              value={p.rolling ? 'rolling' : 'period'}
              options={[
                { value: 'period', label: p.mode === 'month' ? 'This month' : 'This period' },
                { value: 'rolling', label: `Last ${settings.rollingRetentionMonths} months` },
              ]}
              onChange={(v) => p.set({ ret: v === 'rolling' ? 'rolling' : null })}
            />
          </div>

          <KpiTiles tiles={s.tiles} showDeltas={p.mode === 'month'} />

          <SummaryCharts
            V={s.V}
            all={visits}
            m={s.m}
            range={p.period.range}
            trendEnd={p.period.ym ?? monthOf(p.period.range.end)}
            catalogs={catalogs}
            themeKey={themeKey}
          />

          <MathSection s={s} />

          <div className="charts">
            <section className="chart-card" aria-labelledby="bench-title">
              <h3 id="bench-title">Average ticket vs benchmark</h3>
              <BenchmarkTable V={s.V} catalogs={catalogs} />
            </section>
            <section className="chart-card" aria-labelledby="prod-title">
              <h3 id="prod-title">Product usage</h3>
              <ProductTable V={s.V} m={s.m} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
