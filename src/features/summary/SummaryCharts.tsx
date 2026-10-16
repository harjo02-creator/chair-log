import type { TooltipItem } from 'chart.js';
import { money, pct } from '../../domain/format';
import {
  monthlyTrend,
  procedureMix,
  sourceCounts,
  timeBuckets,
  toxCadenceBuckets,
  type PeriodMetrics,
} from '../../domain/metrics';
import type { DateRange } from '../../domain/dates';
import type { Catalogs, Visit, YearMonth } from '../../domain/types';
import { SOURCE_LABEL } from '../../domain/types';
import { barSet, categoryAxis, ChartCard, kfmt, tooltip, valueAxis } from './ChartCard';

const dollars = (c: number) => Math.round(c / 100);

export function SummaryCharts(props: {
  V: Visit[];
  all: Visit[];
  m: PeriodMetrics;
  range: DateRange;
  trendEnd: YearMonth;
  catalogs: Catalogs;
  themeKey: string;
}) {
  const { V, m, range, catalogs, themeKey } = props;
  const buckets = timeBuckets(V, range);
  const weekly = buckets.length > 0 && buckets[0]!.key.length === 10;
  const unit = weekly ? 'week' : 'month';
  const labels = buckets.map((b) => b.label);
  const sources = sourceCounts(V);
  const mix = procedureMix(V, catalogs);
  const cadence = toxCadenceBuckets(V, catalogs);
  const trend = monthlyTrend(props.all, props.trendEnd, 6);

  return (
    <>
      <div className="charts">
        {/* CH-1 */}
        <ChartCard
          wide
          title={weekly ? 'Weekly production' : 'Monthly production'}
          ariaLabel={`Production by ${unit}: service gross and retail, stacked`}
          themeKey={themeKey}
          legend={[
            { label: 'Service gross', color: 'var(--s1)' },
            { label: 'Retail', color: 'var(--s2)' },
          ]}
          table={{
            head: [weekly ? 'Week' : 'Month', 'Service', 'Retail', 'Total'],
            rows: buckets.map((b) => [
              b.label,
              money(b.serviceCents),
              money(b.retailCents),
              money(b.serviceCents + b.retailCents),
            ]),
            numeric: [1, 2, 3],
          }}
          build={(t) => ({
            type: 'bar',
            data: {
              labels,
              datasets: [
                barSet(
                  t,
                  'Service gross',
                  buckets.map((b) => dollars(b.serviceCents)),
                  t.s1,
                  { top: false },
                ),
                barSet(
                  t,
                  'Retail',
                  buckets.map((b) => dollars(b.retailCents)),
                  t.s2,
                ),
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              scales: { x: categoryAxis(t, true), y: valueAxis(t, kfmt, true) },
              plugins: {
                tooltip: {
                  ...tooltip(t),
                  callbacks: {
                    label: (c: TooltipItem<'bar'>) => ` ${c.dataset.label}: ${money(Number(c.raw) * 100)}`,
                    footer: (items: TooltipItem<'bar'>[]) =>
                      `Total: ${money(items.reduce((s, i) => s + Number(i.raw), 0) * 100)}`,
                  },
                },
              },
            },
          })}
        />

        {/* CH-2 */}
        <ChartCard
          short
          title="Where the chair is filled from"
          note="Visits by source. Self-sourced plus referral is the book she brings herself."
          ariaLabel="Visits by source"
          themeKey={themeKey}
          table={{
            head: ['Source', 'Visits', 'Share'],
            rows: sources.map((s) => [SOURCE_LABEL[s.source], s.count, pct(s.share)]),
            numeric: [1, 2],
          }}
          build={(t) => ({
            type: 'bar',
            data: {
              labels: sources.map((s) => SOURCE_LABEL[s.source]),
              datasets: [
                barSet(
                  t,
                  'Visits',
                  sources.map((s) => s.count),
                  [t.s1, t.s2, t.s3],
                  { thickness: 30 },
                ),
              ],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              scales: { x: valueAxis(t, (v) => String(v)), y: categoryAxis(t, false, true) },
              plugins: {
                tooltip: {
                  ...tooltip(t),
                  callbacks: {
                    label: (c: TooltipItem<'bar'>) =>
                      ` ${c.raw} visits (${pct(sources[c.dataIndex]!.share)})`,
                  },
                },
              },
            },
          })}
        />

        {/* CH-3 */}
        <ChartCard
          short
          title={`New vs repeat, by ${unit}`}
          ariaLabel={`New consult and repeat visits by ${unit}, stacked`}
          themeKey={themeKey}
          legend={[
            { label: 'New consult', color: 'var(--s1)' },
            { label: 'Repeat', color: 'var(--s2)' },
          ]}
          table={{
            head: [weekly ? 'Week' : 'Month', 'New consult', 'Repeat'],
            rows: buckets.map((b) => [b.label, b.newCount, b.repeatCount]),
            numeric: [1, 2],
          }}
          build={(t) => ({
            type: 'bar',
            data: {
              labels,
              datasets: [
                barSet(
                  t,
                  'New consult',
                  buckets.map((b) => b.newCount),
                  t.s1,
                  { top: false },
                ),
                barSet(
                  t,
                  'Repeat',
                  buckets.map((b) => b.repeatCount),
                  t.s2,
                ),
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              scales: { x: categoryAxis(t, true), y: valueAxis(t, (v) => String(v), true) },
              plugins: { tooltip: tooltip(t) },
            },
          })}
        />

        {/* CH-4 */}
        <ChartCard
          title="Procedure mix by revenue"
          note="Service gross by primary treatment area."
          ariaLabel="Service gross by treatment area, largest first"
          themeKey={themeKey}
          table={{
            head: ['Area', 'Service gross', 'Visits'],
            rows: mix.map((x) => [x.name, money(x.serviceCents), x.visits]),
            numeric: [1, 2],
          }}
          build={(t) => ({
            type: 'bar',
            data: {
              labels: mix.map((x) => x.name),
              datasets: [
                barSet(
                  t,
                  'Service gross',
                  mix.map((x) => dollars(x.serviceCents)),
                  t.s1,
                  { thickness: 22 },
                ),
              ],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              scales: { x: valueAxis(t, kfmt), y: categoryAxis(t, false, true) },
              plugins: {
                tooltip: {
                  ...tooltip(t),
                  callbacks: {
                    label: (c: TooltipItem<'bar'>) =>
                      ` ${money(Number(c.raw) * 100)} · ${mix[c.dataIndex]!.visits} visits`,
                  },
                },
              },
            },
          })}
        />

        {/* CH-5 */}
        <ChartCard
          title="Tox return cadence"
          note="Repeat neuromodulator visits by days since last treatment. Target window is 90–120 days."
          ariaLabel="Repeat tox visits by days since last treatment"
          themeKey={themeKey}
          legend={[
            { label: 'Outside 90–120 days', color: 'var(--s1)' },
            { label: 'In 90–120 day window', color: 'var(--s3)' },
          ]}
          caption={
            m.toxRepeatCount
              ? `${pct(m.toxCadence)} of ${m.toxRepeatCount} repeat tox visit${m.toxRepeatCount === 1 ? '' : 's'} landed in the 90–120 day window`
              : 'No repeat tox visits with an interval in this period'
          }
          table={{
            head: ['Days since last visit', 'Visits', 'In target window'],
            rows: cadence.map((b) => [b.label, b.count, b.inWindow ? 'Yes' : 'No']),
            numeric: [1],
          }}
          build={(t) => ({
            type: 'bar',
            data: {
              labels: cadence.map((b) => `${b.label} d`),
              datasets: [
                barSet(
                  t,
                  'Repeat tox visits',
                  cadence.map((b) => b.count),
                  cadence.map((b) => (b.inWindow ? t.s3 : t.s1)),
                ),
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: { x: categoryAxis(t), y: valueAxis(t, (v) => String(v)) },
              plugins: {
                tooltip: {
                  ...tooltip(t),
                  callbacks: {
                    label: (c: TooltipItem<'bar'>) =>
                      ` ${c.raw} visits${cadence[c.dataIndex]!.inWindow ? ' · in target window' : ''}`,
                  },
                },
              },
            },
          })}
        />
      </div>

      {/* CH-6: two small charts, never a dual axis */}
      <div className="charts">
        {(
          [
            [
              'Gross production, last 6 months',
              'Gross production by month',
              (p: (typeof trend)[number]) => dollars(p.grossCents),
              kfmt,
              (v: number) => money(v * 100),
            ],
            [
              'Appointments, last 6 months',
              'Appointments by month',
              (p: (typeof trend)[number]) => p.appointments,
              (v: number) => String(v),
              (v: number) => `${v} appointments`,
            ],
          ] as const
        ).map(([title, aria, get, axisFmt, tipFmt]) => (
          <ChartCard
            key={title}
            short
            title={title}
            ariaLabel={aria}
            themeKey={themeKey}
            table={{
              head: ['Month', title.split(',')[0]!],
              rows: trend.map((p) => [p.label, tipFmt(get(p))]),
              numeric: [1],
            }}
            build={(t) => ({
              type: 'line',
              data: {
                labels: trend.map((p) => p.label),
                datasets: [
                  {
                    label: title.split(',')[0]!,
                    data: trend.map(get),
                    borderColor: t.s1,
                    backgroundColor: t.s1,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBorderColor: t.surface,
                    pointBorderWidth: 2,
                    tension: 0,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { x: categoryAxis(t), y: valueAxis(t, axisFmt) },
                plugins: {
                  tooltip: {
                    ...tooltip(t),
                    callbacks: { label: (c: TooltipItem<'line'>) => ` ${tipFmt(Number(c.raw))}` },
                  },
                },
              },
            })}
          />
        ))}
      </div>
    </>
  );
}
