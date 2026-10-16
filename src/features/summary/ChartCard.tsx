import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import { cssVar, prefersReducedMotion } from '../../app/theme';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
);

export interface ChartTokens {
  s1: string;
  s2: string;
  s3: string;
  ink: string;
  muted: string;
  line: string;
  surface: string;
  font: string;
}

export function readTokens(): ChartTokens {
  return {
    s1: cssVar('--s1'),
    s2: cssVar('--s2'),
    s3: cssVar('--s3'),
    ink: cssVar('--ink'),
    muted: cssVar('--muted'),
    line: cssVar('--line'),
    surface: cssVar('--surface'),
    font: cssVar('--f-body').split(',')[0]!.replace(/['"]/g, ''),
  };
}

export interface TableSpec {
  head: string[];
  rows: (string | number)[][];
  /** Columns (by index) to right-align. */
  numeric?: number[];
}

/**
 * One chart with its accessible table alternative (NFR-3, §8). The chart is rebuilt when its data
 * (the table rows) or the theme changes, so colors always come from the current CSS tokens.
 */
export function ChartCard(props: {
  title: string;
  note?: ReactNode;
  caption?: ReactNode;
  legend?: { label: string; color: string }[];
  ariaLabel: string;
  short?: boolean;
  wide?: boolean;
  themeKey: string;
  build: (t: ChartTokens) => ChartConfiguration;
  table: TableSpec;
}) {
  const [asTable, setAsTable] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const build = useRef(props.build);
  build.current = props.build;
  const dataKey = JSON.stringify(props.table.rows);
  const id = useId();

  useEffect(() => {
    if (asTable || !canvas.current) return;
    const t = readTokens();
    Chart.defaults.font.family = t.font;
    Chart.defaults.color = t.muted;
    const cfg = build.current(t);
    cfg.options = { ...cfg.options, animation: prefersReducedMotion() ? false : { duration: 350 } };
    const chart = new Chart(canvas.current, cfg);
    return () => chart.destroy();
  }, [asTable, dataKey, props.themeKey]);

  return (
    <figure
      className={`chart-card ${props.wide ? 'wide' : ''}`}
      aria-labelledby={`${id}-t`}
      style={{ margin: 0 }}
    >
      <div className="section-head" style={{ margin: 0 }}>
        <h3 id={`${id}-t`}>{props.title}</h3>
        <button
          type="button"
          className="btn small ghost no-print"
          aria-pressed={asTable}
          onClick={() => setAsTable((x) => !x)}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>
      {props.note && <p className="note">{props.note}</p>}
      {props.legend && props.legend.length > 1 && !asTable && (
        <div className="legend" aria-hidden="true">
          {props.legend.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {asTable ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={props.ariaLabel}>
          <table>
            <caption className="sr-only">{props.ariaLabel}</caption>
            <thead>
              <tr>
                {props.table.head.map((h, i) => (
                  <th key={h} className={props.table.numeric?.includes(i) ? 'r' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={props.table.numeric?.includes(ci) ? 'r mono' : ''}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`chart-box ${props.short ? 'short' : ''}`}>
          <canvas ref={canvas} role="img" aria-label={props.ariaLabel} />
        </div>
      )}
      {props.caption && <figcaption className="note">{props.caption}</figcaption>}
    </figure>
  );
}

/* ---------- shared Chart.js option builders (§8: thin bars, 4px ends, recessive grid, one axis) ---------- */

export function tooltip(t: ChartTokens) {
  return {
    backgroundColor: t.ink,
    titleColor: t.surface,
    bodyColor: t.surface,
    footerColor: t.surface,
    padding: 10,
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4,
  };
}

export function valueAxis(t: ChartTokens, fmt: (v: number) => string, stacked = false) {
  return {
    stacked,
    beginAtZero: true,
    grid: { color: t.line, drawTicks: false },
    border: { display: false },
    ticks: {
      color: t.muted,
      padding: 8,
      maxTicksLimit: 5,
      precision: 0,
      callback: (v: number | string) => fmt(Number(v)),
    },
  };
}

export function categoryAxis(t: ChartTokens, stacked = false, ink = false) {
  return {
    stacked,
    grid: { display: false },
    border: { color: t.line },
    ticks: { color: ink ? t.ink : t.muted },
  };
}

/** Bar dataset; the top segment of a stack gets rounded ends, lower ones a 2px surface gap. */
export function barSet(
  t: ChartTokens,
  label: string,
  data: number[],
  color: string | string[],
  opts: { top?: boolean; thickness?: number } = {},
) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: t.surface,
    borderWidth: opts.top === false ? { top: 2 } : 0,
    borderRadius: opts.top === false ? 0 : 4,
    borderSkipped: 'start' as const,
    maxBarThickness: opts.thickness ?? 44,
  };
}

export const kfmt = (dollars: number) =>
  dollars >= 1000 ? `$${(dollars / 1000).toFixed(dollars % 1000 ? 1 : 0)}k` : `$${dollars}`;
