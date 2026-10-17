import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { visitsToCsv, withBom } from '../../domain/csv';
import { monthOf } from '../../domain/dates';
import { money, monthName } from '../../domain/format';
import { buildSummary } from '../../domain/summary';
import { copyText, downloadFile } from '../../pwa/files';
import { Empty, Segmented } from '../../components/ui';
import { SummaryCharts } from '../summary/SummaryCharts';
import { BenchmarkTable, KpiTiles, MathSection, ProductTable } from '../summary/SummaryParts';
import { usePeriod } from '../summary/usePeriod';

/** The month / year-to-date / custom review that used to be the Summary tab. */
export function PeriodSection({ themeKey }: { themeKey: string }) {
  const { visits, catalogs, settings, monthRecords } = useData();
  const toast = useToast();
  const p = usePeriod(visits);
  const s = useMemo(
    () =>
      buildSummary(visits, catalogs, p.period, {
        rolling: p.rolling,
        rollingMonths: settings.rollingRetentionMonths,
      }),
    [visits, catalogs, p.period.range.start, p.period.range.end, p.rolling, settings.rollingRetentionMonths], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const csvName = `aurelle-${p.period.ym ?? `${p.period.range.start}_to_${p.period.range.end}`}.csv`;
  const monthOnly = p.period.ym ? monthRecords.find((r) => r.month === p.period.ym) : undefined;

  return (
    <section className="ins-section" id="period" aria-labelledby="period-title">
      <div className="sum-head">
        <div>
          <div className="eyebrow">{p.mode === 'month' ? 'Monthly review' : 'Period review'}</div>
          <h2 id="period-title">{p.period.title}</h2>
        </div>
        <div className="sum-controls">
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
            {monthOnly ? (
              <p>
                {monthName(monthOnly.month)} has monthly totals only
                {monthOnly.appointments != null && `: ${monthOnly.appointments} appointments`}
                {monthOnly.serviceCents != null && `, ${money(monthOnly.serviceCents)} revenue`}. The
                visit-by-visit review fills in once visits are logged; the trends below include the totals.
              </p>
            ) : (
              <p>
                No visits logged for this {p.mode === 'month' ? 'month' : 'period'} yet. Log a visit to see
                the review.
              </p>
            )}
            <Link className="btn primary" to="/log">
              Log a visit
            </Link>
          </Empty>
        </section>
      ) : (
        <>
          <div className="ins-row">
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
            <div className="actions">
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
            </div>
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
    </section>
  );
}
