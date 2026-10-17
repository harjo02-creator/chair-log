import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../app/data';
import { fmtLongDate, money } from '../../domain/format';
import { monthlyTrend, procedureMix } from '../../domain/metrics';
import { monthOf, todayISO } from '../../domain/dates';
import { pitchParts } from '../../domain/pitch';
import { buildSummary } from '../../domain/summary';
import { Empty } from '../../components/ui';
import { BenchmarkTable, KpiTiles, Pitch } from './SummaryParts';
import { usePeriod } from './usePeriod';

/** SUG-5: a printable one-pager for interviews and negotiations. Print → Save as PDF. */
export function ReportPage() {
  const { visits, catalogs, settings } = useData();
  const p = usePeriod(visits);
  const s = useMemo(
    () =>
      buildSummary(visits, catalogs, p.period, {
        rolling: p.rolling,
        rollingMonths: settings.rollingRetentionMonths,
      }),
    [visits, catalogs, p.period.range.start, p.period.range.end, p.rolling, settings.rollingRetentionMonths], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const mix = procedureMix(s.V, catalogs).slice(0, 5);
  const trend = monthlyTrend(visits, p.period.ym ?? monthOf(p.period.range.end), 6);

  return (
    <article className="report">
      <div className="actions no-print">
        <Link className="btn ghost" to="/value">
          ← Back to employer value
        </Link>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <header>
        <div className="eyebrow">Book of business · de-identified</div>
        <h2 style={{ fontSize: 32 }}>{p.period.title}</h2>
        <p className="hint">
          {fmtLongDate(p.period.range.start)} – {fmtLongDate(p.period.range.end)} · prepared{' '}
          {fmtLongDate(todayISO())} from a personal visit log. No client identities are recorded.
        </p>
      </header>
      {s.m.n === 0 ? (
        <Empty>No visits in this period.</Empty>
      ) : (
        <>
          <section className="panel">
            <Pitch parts={pitchParts({ ...s.m, retention: s.retentionShown.rate }, p.period.phrase)} />
          </section>
          <KpiTiles tiles={s.tiles} showDeltas={false} />
          <div className="charts">
            <section className="chart-card">
              <h3>Average ticket vs benchmark</h3>
              <BenchmarkTable V={s.V} catalogs={catalogs} />
            </section>
            <section className="chart-card">
              <h3>Top procedures by revenue</h3>
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th className="r">Visits</th>
                    <th className="r">Service gross</th>
                  </tr>
                </thead>
                <tbody>
                  {mix.map((x) => (
                    <tr key={x.area}>
                      <td>{x.name}</td>
                      <td className="r mono">{x.visits}</td>
                      <td className="r mono">{money(x.serviceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          <section className="chart-card">
            <h3>Last 6 months</h3>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="r">Appointments</th>
                  <th className="r">Gross production</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.ym}>
                    <td>{t.label}</td>
                    <td className="r mono">{t.appointments}</td>
                    <td className="r mono">{money(t.grossCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="hint">
            Definitions: retention = clients with a repeat visit ÷ unique clients (
            {s.retentionShown.label.toLowerCase()}); rebook rate = visits rebooked at checkout ÷ appointments;
            book independence = self-sourced + referral visits ÷ appointments. Average ticket is service only;
            retail is tracked separately.
          </p>
        </>
      )}
    </article>
  );
}
