import type { ReactNode } from 'react';
import type { ChartConfiguration, TooltipItem } from 'chart.js';
import { barSet, categoryAxis, ChartCard, tooltip, valueAxis, type ChartTokens } from './ChartCard';

export type SeriesColor = 's1' | 's2' | 's3' | 's4' | 'muted';

export interface Series {
  label: string;
  values: (number | null)[];
  color: SeriesColor;
}

interface Common {
  title: string;
  note?: ReactNode;
  caption?: ReactNode;
  ariaLabel: string;
  themeKey: string;
  labels: string[];
  series: Series[];
  /** Axis tick text. */
  fmtAxis: (v: number) => string;
  /** Tooltip and table text. */
  fmt: (v: number) => string;
  /** First table column heading. */
  xHead?: string;
  short?: boolean;
  wide?: boolean;
}

const cssColor = (t: ChartTokens, c: SeriesColor) => (c === 'muted' ? t.muted : t[c]);

/** Light fill with diagonal hatching: months that are her estimates, not counted visits. */
export function stripes(color: string): CanvasPattern | string {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  if (!g) return color;
  g.fillStyle = color;
  g.globalAlpha = 0.3;
  g.fillRect(0, 0, 8, 8);
  g.globalAlpha = 1;
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  for (const [x1, y1, x2, y2] of [
    [0, 8, 8, 0],
    [-2, 2, 2, -2],
    [6, 10, 10, 6],
  ] as const) {
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
  }
  g.stroke();
  return g.createPattern(c, 'repeat') ?? color;
}

function table(p: Common, estimate?: boolean[]) {
  return {
    head: [p.xHead ?? 'Month', ...p.series.map((s) => s.label), ...(estimate ? ['Source'] : [])],
    rows: p.labels.map((l, i) => [
      l,
      ...p.series.map((s) => (s.values[i] == null ? '—' : p.fmt(s.values[i]!))),
      ...(estimate ? [estimate[i] ? 'Estimate' : 'Logged visits'] : []),
    ]),
    numeric: p.series.map((_, i) => i + 1),
  };
}

/**
 * Bars (stacked when there are several series). `estimate[i]` hatches that column. Columns with
 * no value at all get a "not entered" tooltip instead of looking like zero.
 */
export function BarsCard(
  p: Common & { estimate?: boolean[]; horizontal?: boolean; thickness?: number; max?: number },
) {
  const stacked = p.series.length > 1;
  const legend = [
    ...p.series.map((s) => ({ label: s.label, color: `var(--${s.color === 'muted' ? 'muted' : s.color})` })),
  ];
  return (
    <ChartCard
      title={p.title}
      note={p.note}
      caption={p.caption}
      ariaLabel={p.ariaLabel}
      themeKey={p.themeKey}
      short={p.short}
      wide={p.wide}
      legend={stacked ? legend : undefined}
      table={table(p, p.estimate?.some(Boolean) ? p.estimate : undefined)}
      build={(t): ChartConfiguration => ({
        type: 'bar',
        data: {
          labels: p.labels,
          datasets: p.series.map((s, si) => {
            const color = cssColor(t, s.color);
            const fill = p.estimate?.some(Boolean)
              ? p.labels.map((_, i) => (p.estimate![i] ? stripes(color) : color))
              : color;
            return barSet(
              t,
              s.label,
              s.values.map((v) => v ?? 0),
              fill as string,
              { top: stacked && si < p.series.length - 1 ? false : undefined, thickness: p.thickness },
            );
          }),
        },
        options: {
          indexAxis: p.horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false, axis: p.horizontal ? 'y' : 'x' },
          scales: p.horizontal
            ? { x: valueAxis(t, p.fmtAxis, stacked), y: categoryAxis(t, stacked, true) }
            : {
                x: categoryAxis(t, stacked),
                y: { ...valueAxis(t, p.fmtAxis, stacked), ...(p.max != null ? { max: p.max } : {}) },
              },
          plugins: {
            tooltip: {
              ...tooltip(t),
              callbacks: {
                label: (c: TooltipItem<'bar'>) => {
                  const v = p.series[c.datasetIndex]!.values[c.dataIndex];
                  const name = stacked ? `${c.dataset.label}: ` : '';
                  return ` ${name}${v == null ? 'not entered' : p.fmt(v)}`;
                },
                footer: (items: TooltipItem<'bar'>[]) =>
                  p.estimate?.[items[0]?.dataIndex ?? -1] ? 'Estimate' : '',
              },
            },
          },
        },
      })}
    />
  );
}

/** Lines drawn point to point; gaps where a month has no value. */
export function LinesCard(p: Common & { max?: number }) {
  return (
    <ChartCard
      title={p.title}
      note={p.note}
      caption={p.caption}
      ariaLabel={p.ariaLabel}
      themeKey={p.themeKey}
      short={p.short}
      wide={p.wide}
      legend={p.series.map((s) => ({ label: s.label, color: `var(--${s.color})` }))}
      table={table(p)}
      build={(t): ChartConfiguration => ({
        type: 'line',
        data: {
          labels: p.labels,
          datasets: p.series.map((s) => ({
            label: s.label,
            data: s.values,
            borderColor: cssColor(t, s.color),
            backgroundColor: cssColor(t, s.color),
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBorderColor: t.surface,
            pointBorderWidth: 2,
            tension: 0,
            spanGaps: false,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: categoryAxis(t),
            y: { ...valueAxis(t, p.fmtAxis), ...(p.max != null ? { max: p.max } : {}) },
          },
          plugins: {
            tooltip: {
              ...tooltip(t),
              callbacks: {
                label: (c: TooltipItem<'line'>) => {
                  const v = p.series[c.datasetIndex]!.values[c.dataIndex];
                  return ` ${p.series.length > 1 ? `${c.dataset.label}: ` : ''}${v == null ? 'no data' : p.fmt(v)}`;
                },
              },
            },
          },
        },
      })}
    />
  );
}
