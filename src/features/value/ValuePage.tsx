import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../../app/data';
import { useThemeKey } from '../../app/theme';
import { useToast } from '../../app/toast';
import { addMonths, monthEnd, monthOf, todayISO } from '../../domain/dates';
import { money, monthName, monthShort, pct } from '../../domain/format';
import { dataMonths, pointsToCsv, type MonthPoint } from '../../domain/monthly';
import { buildValue, valuePitch, type MetricStatus, type ValueMetric } from '../../domain/value';
import { copyText, downloadFile } from '../../pwa/files';
import { withBom } from '../../domain/csv';
import { Empty, Segmented } from '../../components/ui';
import { kfmt } from '../summary/ChartCard';
import { BarsCard, LinesCard } from '../summary/SimpleCharts';

const STATUS: Record<MetricStatus, { icon: string; text: (m: ValueMetric) => string; cls: string }> = {
  tracked: { icon: '✓', text: () => 'From logged visits', cls: 'good' },
  estimate: { icon: '●', text: () => 'Includes estimates', cls: '' },
  partial: {
    icon: '▲',
    text: (m) => `Missing ${m.missing.map((x) => x.split(' ')[0]).join(', ')}`,
    cls: 'warn',
  },
  missing: { icon: '▲', text: () => 'Data missing', cls: 'warn' },
};

function MetricTiles({ metrics, label }: { metrics: ValueMetric[]; label: string }) {
  return (
    <div className={`kpis ${metrics.length === 3 ? 'n3' : ''}`} role="list" aria-label={label}>
      {metrics.map((m) => {
        const s = STATUS[m.status];
        return (
          <div className={`kpi ${m.status === 'missing' ? 'is-missing' : ''}`} role="listitem" key={m.key}>
            <span className="eyebrow">{m.label}</span>
            <span className="v">{m.display}</span>
            <span className="sub">{m.sub}</span>
            <span className="meta">
              <span className={`chip ${s.cls}`}>
                <span aria-hidden="true">{s.icon}</span>
                {s.text(m)}
              </span>
            </span>
            {(m.status === 'missing' || m.status === 'partial') && (
              <span className="hint">
                Add {m.need} to complete this.{' '}
                {m.need.includes('visit') ? (
                  <Link to="/log">Log a visit</Link>
                ) : (
                  <Link to="/months">Monthly totals</Link>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const dollars = (c: number | null) => (c == null ? null : Math.round(c / 100));

/** Default end month: the latest complete month with data, else the latest month with data. */
function defaultEnd(months: string[], today: string): string {
  const current = monthOf(today);
  const done = months.filter((m) => m < current);
  return done.length ? done[done.length - 1]! : (months[months.length - 1] ?? current);
}

/** Only the three things a clinic director asks for: client volume, retention, revenue production. */
export function ValuePage() {
  const { visits, catalogs, settings, monthRecords } = useData();
  const themeKey = useThemeKey(settings.theme);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const months = useMemo(() => dataMonths(visits, monthRecords), [visits, monthRecords]);
  const endParam = params.get('end');
  const end = endParam && /^\d{4}-\d{2}$/.test(endParam) ? endParam : defaultEnd(months, today);
  const span = params.get('span') === '12' ? 12 : 6;
  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v == null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const m = useMemo(
    () => buildValue(visits, monthRecords, catalogs, end, span),
    [visits, monthRecords, catalogs, end, span],
  );
  const pitch = valuePitch(m);
  const pts = m.points;
  const labels = pts.map((p) => p.label);
  const estimate = pts.map((p) => p.source === 'estimate');
  const returningShare = (p: MonthPoint) =>
    p.newClients != null && p.returningClients != null && p.newClients + p.returningClients > 0
      ? p.returningClients / (p.newClients + p.returningClients)
      : null;
  const ticket = (p: MonthPoint) =>
    p.grossCents != null && p.appointments ? dollars(p.grossCents / p.appointments) : null;
  const endOptions = [...new Set([...months, end])].sort().reverse();
  const first = addMonths(end, -(span - 1));

  return (
    <>
      <div className="sum-head">
        <div>
          <div className="eyebrow">For employers</div>
          <h2>Employer value</h2>
          <p className="hint">
            {monthShort(first)} – {monthShort(end)}. The three things clinic directors ask an injector for.
          </p>
        </div>
        <div className="sum-controls">
          <Segmented
            legend="Window"
            name="span"
            value={String(span) as '6' | '12'}
            options={[
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
            ]}
            onChange={(v) => set('span', v === '12' ? '12' : null)}
          />
          <div className="field">
            <label htmlFor="v-end">Ending</label>
            <select id="v-end" value={end} onChange={(e) => set('end', e.target.value)}>
              {endOptions.map((x) => (
                <option key={x} value={x}>
                  {monthName(x)}
                  {x === monthOf(today) ? ' (in progress)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!m.hasData ? (
        <section className="panel">
          <Empty>
            <p>
              Nothing logged for {monthShort(first)} – {monthShort(end)} yet. Log visits, or add monthly
              totals for months you only have estimates for.
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn primary" to="/log">
                Log a visit
              </Link>
              <Link className="btn" to="/months">
                Add monthly totals
              </Link>
            </div>
          </Empty>
        </section>
      ) : (
        <>
          <section className="panel" aria-labelledby="vpitch-title">
            <div className="eyebrow" id="vpitch-title" style={{ marginBottom: 8 }}>
              Say it in 30 seconds
            </div>
            <p className="pitch">
              {pitch.map((p, i) =>
                p.strong ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>,
              )}
            </p>
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn small"
                onClick={async () =>
                  toast.show(
                    (await copyText(pitch.map((p) => p.text).join('')))
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
                onClick={() =>
                  downloadFile(
                    `aurelle-monthly-${first}_to_${end}.csv`,
                    withBom(pointsToCsv(pts)),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                Download monthly totals (CSV)
              </button>
              <Link className="btn small" to={`/report?mode=custom&start=${first}-01&end=${monthEnd(end)}`}>
                Book of Business one-pager
              </Link>
            </div>
            {m.usesEstimates && (
              <p className="hint" style={{ marginTop: 10 }}>
                Hatched bars and “Includes estimates” mark months from your monthly totals rather than logged
                visits. Say so when you present them.
              </p>
            )}
          </section>

          <section className="ins-section" id="volume" aria-labelledby="volume-title">
            <div className="section-head">
              <h2 id="volume-title">Volume of active clients</h2>
              <span className="hint">How many different people sat in your chair</span>
            </div>
            <MetricTiles metrics={m.volume} label="Client volume" />
            <div className="charts">
              <BarsCard
                short
                title="Clients per month, new and returning"
                ariaLabel="New and returning clients by month, stacked"
                themeKey={themeKey}
                labels={labels}
                estimate={estimate}
                series={[
                  { label: 'New', values: pts.map((p) => p.newClients), color: 's1' },
                  { label: 'Returning', values: pts.map((p) => p.returningClients), color: 's4' },
                ]}
                fmtAxis={String}
                fmt={(v) => `${v} clients`}
                caption={
                  pts.some((p) => p.newClients != null)
                    ? undefined
                    : 'Data missing: no new or returning client counts yet.'
                }
              />
              <BarsCard
                short
                title="Appointments per month"
                ariaLabel="Appointments by month"
                themeKey={themeKey}
                labels={labels}
                estimate={estimate}
                series={[{ label: 'Appointments', values: pts.map((p) => p.appointments), color: 's1' }]}
                fmtAxis={String}
                fmt={(v) => `${v} appointments`}
              />
            </div>
          </section>

          <section className="ins-section" id="retention" aria-labelledby="retention-title">
            <div className="section-head">
              <h2 id="retention-title">Retention and rebook rate</h2>
              <span className="hint">Clients who come back to you, not just to the practice</span>
            </div>
            <MetricTiles metrics={m.retention} label="Retention" />
            <div className="charts">
              <LinesCard
                short
                wide
                title="Returning clients and rebook rate"
                note="Returning: share of the month’s clients who had seen you before. Rebook: visits that booked their next one."
                ariaLabel="Returning client share and rebook rate by month"
                themeKey={themeKey}
                labels={labels}
                series={[
                  { label: 'Returning', values: pts.map(returningShare), color: 's4' },
                  { label: 'Rebooked', values: pts.map((p) => p.rebookRate), color: 's1' },
                ]}
                fmtAxis={(v) => pct(v)}
                fmt={pct}
                max={1}
                caption={
                  pts.some((p) => returningShare(p) != null || p.rebookRate != null)
                    ? undefined
                    : 'Data missing: needs new and returning client counts, or logged visits.'
                }
              />
            </div>
          </section>

          <section className="ins-section" id="revenue" aria-labelledby="revenue-title">
            <div className="section-head">
              <h2 id="revenue-title">Revenue production</h2>
              <span className="hint">Billed by your hands: service fees plus retail and skincare</span>
            </div>
            <MetricTiles metrics={m.revenue} label="Revenue production" />
            <div className="charts">
              <BarsCard
                short
                title="Gross billing per month"
                ariaLabel="Service and retail billing by month, stacked"
                themeKey={themeKey}
                labels={labels}
                estimate={estimate}
                series={[
                  { label: 'Services', values: pts.map((p) => dollars(p.serviceCents)), color: 's2' },
                  {
                    label: 'Retail and skincare',
                    values: pts.map((p) => dollars(p.retailCents)),
                    color: 's4',
                  },
                ]}
                fmtAxis={kfmt}
                fmt={(v) => money(v * 100)}
                caption={
                  pts.some((p) => p.source !== 'none' && p.serviceCents == null)
                    ? `Data missing: no revenue for ${pts
                        .filter((p) => p.source !== 'none' && p.serviceCents == null)
                        .map((p) => p.label)
                        .join(', ')}.`
                    : undefined
                }
              />
              <LinesCard
                short
                title="Average spend per ticket"
                ariaLabel="Average spend per appointment by month"
                themeKey={themeKey}
                labels={labels}
                series={[{ label: 'Average ticket', values: pts.map(ticket), color: 's2' }]}
                fmtAxis={kfmt}
                fmt={(v) => money(v * 100)}
              />
            </div>
          </section>
        </>
      )}
    </>
  );
}
