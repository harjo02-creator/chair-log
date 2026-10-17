import { CATEGORY_LABEL, type Catalogs, type Visit } from '../../domain/types';
import { fmtQty, money, moneyExact, pct } from '../../domain/format';
import { categoryTickets, productUsage, type PeriodMetrics } from '../../domain/metrics';
import type { PitchPart } from '../../domain/pitch';
import type { SummaryModel, Tile } from '../../domain/summary';
import { ChipView } from '../../components/ui';

export function Pitch({ parts }: { parts: PitchPart[] }) {
  return (
    <p className="pitch">
      {parts.map((p, i) => (p.strong ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </p>
  );
}

export function KpiTiles({ tiles, showDeltas }: { tiles: Tile[]; showDeltas: boolean }) {
  return (
    <div className="kpis" role="list" aria-label="Key numbers">
      {tiles.map((t) => (
        <div className="kpi" key={t.key} role="listitem">
          <span className="eyebrow">{t.label}</span>
          <span className="v">{t.value}</span>
          <span className="sub">{t.sub}</span>
          {(t.chip || (showDeltas && t.delta)) && (
            <span className="meta">
              <ChipView chip={t.chip} />
              {showDeltas && t.delta && (
                <span className="delta">
                  <span aria-hidden="true">
                    {t.delta.dir === 'up' ? '▲' : t.delta.dir === 'down' ? '▼' : '●'}
                  </span>{' '}
                  <span className="sr-only">
                    {t.delta.dir === 'up' ? 'Up' : t.delta.dir === 'down' ? 'Down' : 'No change,'}
                  </span>{' '}
                  {t.delta.text} vs last month
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Fraction({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="frac">
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}

function Formula(props: {
  title: string;
  nl: string;
  dl: string;
  num: string;
  den: string;
  res: string;
  bench?: string;
}) {
  return (
    <div className="formula">
      <h3>{props.title}</h3>
      <div className="eq">
        <Fraction top={props.nl} bottom={props.dl} />
        <span aria-hidden="true">=</span>
        <Fraction top={props.num} bottom={props.den} />
        <span aria-hidden="true">=</span>
        <span className="res">{props.res}</span>
      </div>
      <span className="sr-only">
        {props.nl} {props.num} divided by {props.dl} {props.den} equals {props.res}
      </span>
      {props.bench && <div className="bench">{props.bench}</div>}
    </div>
  );
}

/** SUM-4 */
export function MathSection({ s }: { s: SummaryModel }) {
  const { m, retentionShown: r } = s;
  return (
    <section aria-labelledby="math-title">
      <div className="section-head">
        <h2 id="math-title">Show the math</h2>
        <span className="hint">This period's numbers plugged into each formula</span>
      </div>
      <div className="math">
        <Formula
          title="Average ticket"
          nl="Total est. gross billing"
          dl="Completed appointments"
          num={money(m.serviceCents)}
          den={String(m.n)}
          res={money(m.avgTicketCents)}
          bench="Benchmark: tox-only $350–$500 · filler $700–$1,200+"
        />
        <Formula
          title="Patient retention"
          nl="Repeat client IDs"
          dl="Total unique client IDs"
          num={String(r.returning)}
          den={String(r.unique)}
          res={pct(r.rate)}
          bench={`${r.label}. Above 60% is strong for a first-year injector.`}
        />
        <Formula
          title="Point-of-sale rebook rate"
          nl="Visits with rebook = Yes"
          dl="Visits with rebook recorded"
          num={String(m.rebookedCount)}
          den={String(m.rated)}
          res={pct(m.rebookRate)}
        />
        <Formula
          title="Book independence ratio"
          nl="Self-sourced + referral visits"
          dl="Visits with source recorded"
          num={String(m.independentCount)}
          den={String(m.rated)}
          res={pct(m.independence)}
          bench="A high ratio shows clients seek out her technique, not just clinic walk-ins."
        />
      </div>
    </section>
  );
}

/** SUM-5 */
export function BenchmarkTable({ V, catalogs }: { V: Visit[]; catalogs: Catalogs }) {
  const rows = categoryTickets(V, catalogs);
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Average ticket vs benchmark">
      <table>
        <caption className="sr-only">Average ticket by category against benchmarks</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th className="r">Visits</th>
            <th className="r">Avg ticket</th>
            <th>Benchmark</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <td>{CATEGORY_LABEL[r.category]}</td>
              <td className="r mono">{r.visits}</td>
              <td className="r mono">{money(r.avgTicketCents)}</td>
              <td>{r.benchmark ?? 'No benchmark'}</td>
              <td>{r.chip ? <ChipView chip={r.chip} /> : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** SUM-6 */
export function ProductTable({ V, m }: { V: Visit[]; m: PeriodMetrics }) {
  const rows = productUsage(V);
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Product usage">
      <table>
        <caption className="sr-only">Product usage</caption>
        <thead>
          <tr>
            <th>Product</th>
            <th className="r">Visits</th>
            <th className="r">Total</th>
            <th className="r">Avg / visit</th>
            <th className="r">Gross</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId}>
              <td>{r.name}</td>
              <td className="r mono">{r.visits}</td>
              <td className="r mono">{fmtQty(r.totalQty, r.unit)}</td>
              <td className="r mono">{fmtQty(r.avgQtyPerVisit, r.unit)}</td>
              <td className="r mono">{moneyExact(r.grossCents)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="muted">
                No products in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {m.avgToxUnits != null && (
        <p className="hint" style={{ marginTop: 8 }}>
          Average tox units per line: {m.avgToxUnits.toFixed(1)}u (Botox, Xeomin, Daxxify; Dysport units
          aren't comparable and are shown on their own row).
        </p>
      )}
    </div>
  );
}
