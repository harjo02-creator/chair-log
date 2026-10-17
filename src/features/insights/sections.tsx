import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CATEGORY_LABEL, type Catalogs, type Visit } from '../../domain/types';
import { fmtLongDate, fmtShortDate, money, pct } from '../../domain/format';
import {
  calendarWeeks,
  cohortRetention,
  GOAL_META,
  goalProgress,
  productionPerDay,
  rebookPipeline,
  topClients,
  visitsPerClient,
  visitTrend,
  weekdayStats,
  type Goal,
  type PipelineClient,
  type Recommendation,
} from '../../domain/insights';
import type { MonthPoint } from '../../domain/monthly';
import { kfmt } from '../summary/ChartCard';
import { BarsCard, LinesCard } from '../summary/SimpleCharts';
import { Empty } from '../../components/ui';

export const scrollToSection = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function SectionHead(props: { id: string; title: string; hint?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 id={`${props.id}-title`}>{props.title}</h2>
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

function NeedsVisits({ what }: { what: string }) {
  return (
    <section className="panel">
      <Empty>
        <p>{what} needs visit-by-visit entries with client IDs. Monthly totals alone can’t show it.</p>
        <Link className="btn primary" to="/log">
          Log a visit
        </Link>
      </Empty>
    </section>
  );
}

const count = (v: number) => String(Math.round(v * 10) / 10);
const dollars = (c: number | null) => (c == null ? null : Math.round(c / 100));

/* ---------- focus ---------- */

const TONE: Record<Recommendation['tone'], { icon: string; text: string; cls: string }> = {
  act: { icon: '▲', text: 'Act on this', cls: 'warn' },
  watch: { icon: '●', text: 'Keep an eye on', cls: '' },
  strength: { icon: '✓', text: 'Working well', cls: 'good' },
};
const AREA_LABEL: Record<Recommendation['area'], string> = {
  volume: 'Client volume',
  retention: 'Retention',
  revenue: 'Revenue',
  data: 'Missing data',
};

function RecCard({ r }: { r: Recommendation }) {
  const tone = TONE[r.tone];
  return (
    <li className={`rec ${r.tone}`}>
      <div className="rec-meta">
        <span className={`chip ${tone.cls}`}>
          <span aria-hidden="true">{tone.icon}</span>
          {tone.text}
        </span>
        <span className="hint">{AREA_LABEL[r.area]}</span>
        {r.impactCents != null && r.impactCents > 0 && (
          <span className="hint mono">
            ≈ {money(r.impactCents)} {r.impactLabel}
          </span>
        )}
      </div>
      <h3>{r.title}</h3>
      <p className="small">{r.finding}</p>
      <p className="small">
        <b>Try:</b> {r.action}
      </p>
      <button type="button" className="btn link" onClick={() => scrollToSection(r.anchor)}>
        See the numbers
      </button>
    </li>
  );
}

export function FocusSection({ recs }: { recs: Recommendation[] }) {
  const todo = recs.filter((r) => r.tone !== 'strength');
  const good = recs.filter((r) => r.tone === 'strength');
  return (
    <section className="ins-section" id="focus" aria-labelledby="focus-title">
      <SectionHead
        id="focus"
        title="What to focus on"
        hint="From the last 90 days. Each one moves a number employers ask about."
      />
      {!recs.length ? (
        <section className="panel">
          <Empty>
            <p>
              Log at least 10 visits to get suggestions. Until then, the sections below show what’s there.
            </p>
          </Empty>
        </section>
      ) : (
        <>
          {todo.length > 0 && (
            <ol className="recs" aria-label="Suggestions">
              {todo.map((r) => (
                <RecCard key={r.id} r={r} />
              ))}
            </ol>
          )}
          {good.length > 0 && (
            <>
              <h3 className="ins-sub">What’s working</h3>
              <ul className="recs" aria-label="Strengths">
                {good.map((r) => (
                  <RecCard key={r.id} r={r} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- goals ---------- */

export function GoalsSection(props: {
  goals: Goal[];
  thisMonth: MonthPoint;
  lastMonth: MonthPoint;
  today: string;
}) {
  const { goals, thisMonth, lastMonth, today } = props;
  return (
    <section className="ins-section" id="goals" aria-labelledby="goals-title">
      <SectionHead
        id="goals"
        title={`Goals for ${thisMonth.label}`}
        hint={<Link to="/settings#goals">Edit goals</Link>}
      />
      {!goals.length ? (
        <section className="panel">
          <Empty>
            <p>
              Set monthly goals for billing, appointments, new clients, rebook rate or retail to track them
              here.
            </p>
            <Link className="btn" to="/settings#goals">
              Set goals
            </Link>
          </Empty>
        </section>
      ) : (
        <div className="goals" role="list">
          {goals
            .slice()
            .sort(
              (a, b) => Object.keys(GOAL_META).indexOf(a.metric) - Object.keys(GOAL_META).indexOf(b.metric),
            )
            .map((g) => {
              const now = goalProgress(g, thisMonth, today);
              const prev = goalProgress(g, lastMonth, today);
              const width = Math.min(1, now.share ?? 0) * 100;
              const statusText = {
                met: '✓ Met',
                'on-track': '● On pace',
                behind: '▲ Behind pace',
                'no-data': '— No data yet',
              }[now.status];
              return (
                <div className="goal panel" role="listitem" key={g.metric}>
                  <div className="goal-head">
                    <span className="eyebrow">{now.label}</span>
                    <span
                      className={`chip ${now.status === 'met' ? 'good' : now.status === 'behind' ? 'warn' : ''}`}
                    >
                      {statusText}
                    </span>
                  </div>
                  <div className="goal-val mono">{now.text}</div>
                  <div
                    className="goal-bar"
                    role="progressbar"
                    aria-label={`${now.label} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(width)}
                  >
                    <span className={`fill ${now.status}`} style={{ width: `${width}%` }} />
                    {GOAL_META[g.metric].kind !== 'ratio' &&
                      now.status !== 'met' &&
                      now.expected > 0 &&
                      now.expected < 1 && (
                        <span
                          className="pace"
                          style={{ left: `${now.expected * 100}%` }}
                          title="Where she’d be on pace today"
                        />
                      )}
                  </div>
                  <span className="hint">
                    {lastMonth.label}:{' '}
                    {prev.status === 'no-data'
                      ? 'no data'
                      : `${prev.text}${prev.status === 'met' ? ', met' : ''}`}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}

/* ---------- loyalty ---------- */

export function LoyaltySection(props: {
  visits: Visit[];
  catalogs: Catalogs;
  endYm: string;
  span: number;
  themeKey: string;
}) {
  const { visits, catalogs, endYm, span, themeKey } = props;
  const cohorts = cohortRetention(visits, endYm, span, 6);
  const perClient = visitsPerClient(visits);
  const top = topClients(visits, 10);
  const trend = visitTrend(visits, catalogs, endYm, span);
  return (
    <section className="ins-section" id="loyalty" aria-labelledby="loyalty-title">
      <SectionHead id="loyalty" title="Client loyalty" hint="Who comes back, and how often" />
      {!visits.length ? (
        <NeedsVisits what="Client loyalty" />
      ) : (
        <div className="charts">
          <figure className="chart-card wide" aria-labelledby="cohort-title" style={{ margin: 0 }}>
            <h3 id="cohort-title">Do new clients come back?</h3>
            <p className="note">
              Clients grouped by the month of their first visit, and the share seen again within 1 to 6
              months.
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Cohort retention">
              <table className="cohort">
                <caption className="sr-only">
                  Share of each month’s new clients who returned within 1 to 6 months
                </caption>
                <thead>
                  <tr>
                    <th>First visit</th>
                    <th className="r">Clients</th>
                    {[1, 2, 3, 4, 5, 6].map((k) => (
                      <th key={k} className="r">
                        {k} mo
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.ym}>
                      <td>{c.label}</td>
                      <td className="r mono">{c.size}</td>
                      {c.returned.map((x, k) => (
                        <td
                          key={k}
                          className="r mono heat"
                          style={
                            x != null && c.size
                              ? {
                                  background: `color-mix(in srgb, var(--s1) ${Math.round(x * 70)}%, var(--surface))`,
                                }
                              : undefined
                          }
                        >
                          {c.size === 0 ? '' : x == null ? '·' : pct(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="note">· means that month hasn’t happened yet.</figcaption>
          </figure>

          <BarsCard
            short
            title="Visits per client"
            note="How many times each client has been in your chair."
            ariaLabel="Clients by number of visits"
            themeKey={themeKey}
            xHead="Visits"
            labels={perClient.map((b) => b.label)}
            series={[{ label: 'Clients', values: perClient.map((b) => b.clients), color: 's1' }]}
            fmtAxis={String}
            fmt={(v) => `${v} client${v === 1 ? '' : 's'}`}
          />

          <LinesCard
            short
            title="Rebooked at checkout"
            note="Share of each month’s visits that booked their next one."
            ariaLabel="Rebook rate by month"
            themeKey={themeKey}
            labels={trend.map((p) => p.label)}
            series={[{ label: 'Rebook rate', values: trend.map((p) => p.rebookRate), color: 's3' }]}
            fmtAxis={(v) => pct(v)}
            fmt={pct}
            max={1}
          />

          <section className="chart-card" aria-labelledby="top-title">
            <h3 id="top-title">Top clients by lifetime billing</h3>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Top clients">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="r">Visits</th>
                    <th className="r">Billing</th>
                    <th>Last visit</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.clientId}>
                      <td>
                        <Link className="client-link mono" to={`/clients/${encodeURIComponent(c.clientId)}`}>
                          {c.clientId}
                        </Link>
                      </td>
                      <td className="r mono">{c.visits}</td>
                      <td className="r mono">{money(c.grossCents)}</td>
                      <td>{fmtLongDate(c.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

/* ---------- rebook pipeline ---------- */

function PipelineTable({ label, rows }: { label: string; rows: PipelineClient[] }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label} style={{ maxHeight: 320 }}>
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Treatment</th>
            <th>Last visit</th>
            <th>Due window</th>
            <th className="r">Last ticket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.clientId}>
              <td>
                <Link className="client-link mono" to={`/clients/${encodeURIComponent(c.clientId)}`}>
                  {c.clientId}
                </Link>
              </td>
              <td>{CATEGORY_LABEL[c.category]}</td>
              <td>{fmtShortDate(c.lastDate)}</td>
              <td>
                {fmtShortDate(c.dueStart)} – {fmtShortDate(c.dueEnd)}
              </td>
              <td className="r mono">{money(c.lastTicketCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineSection(props: {
  visits: Visit[];
  catalogs: Catalogs;
  today: string;
  themeKey: string;
}) {
  const p = rebookPipeline(props.visits, props.catalogs, props.today);
  const lapsed = p.clients.filter((c) => c.status === 'lapsed').length;
  const upcoming = p.weeks.reduce((s, w) => s + w.clients, 0);
  return (
    <section className="ins-section" id="pipeline" aria-labelledby="pipeline-title">
      <SectionHead
        id="pipeline"
        title="Rebook pipeline"
        hint="Tox is due back at 90–120 days, filler at 9–12 months, biostimulator at 5–8 weeks"
      />
      {!props.visits.length ? (
        <NeedsVisits what="The rebook pipeline" />
      ) : (
        <>
          <div className="kpis" role="list" aria-label="Pipeline">
            {[
              [
                'Due back now',
                p.due.length,
                p.due.length ? money(p.dueCents) : null,
                'Inside their window, not booked',
              ],
              [
                'Overdue',
                p.overdue.length,
                p.overdue.length ? money(p.overdueCents) : null,
                'Past their window, not booked',
              ],
              ['Booked ahead', p.booked, null, 'Rebooked at their last visit'],
              ['Coming due', upcoming, null, 'In the next 12 weeks'],
            ].map(([label, n, cents, sub]) => (
              <div className="kpi" role="listitem" key={String(label)}>
                <span className="eyebrow">{label}</span>
                <span className="v">{n}</span>
                <span className="sub">
                  {sub}
                  {cents ? ` · ${cents} at last ticket` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="charts">
            <BarsCard
              wide
              short
              title="Clients coming due, by week"
              note="Clients whose return window opens that week and who haven’t booked."
              ariaLabel="Clients coming due in each of the next 12 weeks"
              themeKey={props.themeKey}
              xHead="Week of"
              labels={p.weeks.map((w) => w.label)}
              series={[{ label: 'Clients', values: p.weeks.map((w) => w.clients), color: 's1' }]}
              fmtAxis={String}
              fmt={(v) => `${v} client${v === 1 ? '' : 's'}`}
            />
            {p.due.length > 0 && (
              <section className="chart-card" aria-labelledby="due-title">
                <h3 id="due-title">Due back now</h3>
                <PipelineTable label="Clients due back now" rows={p.due} />
              </section>
            )}
            {p.overdue.length > 0 && (
              <section className="chart-card" aria-labelledby="overdue-title">
                <h3 id="overdue-title">Overdue</h3>
                <PipelineTable label="Overdue clients" rows={p.overdue} />
              </section>
            )}
          </div>
          {lapsed > 0 && (
            <p className="hint">
              {lapsed} client{lapsed === 1 ? ' hasn’t' : 's haven’t'} been back for more than 3 months past
              their window and {lapsed === 1 ? 'is' : 'are'} left off these lists.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- busy patterns ---------- */

export function PatternsSection(props: {
  visits: Visit[];
  points: MonthPoint[];
  today: string;
  themeKey: string;
}) {
  const { visits, points, today, themeKey } = props;
  const weeks = calendarWeeks(visits, today, 26);
  const max = Math.max(1, ...weeks.flat().map((d) => d.visits));
  const wd = weekdayStats(visits.filter((v) => v.date >= weeks[0]![0]!.date && v.date <= today));
  const perDay = productionPerDay(points, visits);
  const estimate = points.map((p) => p.source === 'estimate');
  const labels = points.map((p) => p.label);
  const daysOut = points.reduce((s, p) => s + (p.daysOut ?? 0), 0);
  return (
    <section className="ins-section" id="patterns" aria-labelledby="patterns-title">
      <SectionHead id="patterns" title="Busy patterns" hint="When the chair is full, and when it isn’t" />
      <div className="charts">
        <BarsCard
          short
          title="Appointments by month"
          note="Hatched months are monthly totals (estimates), not logged visits."
          ariaLabel="Appointments by month"
          themeKey={themeKey}
          labels={labels}
          estimate={estimate}
          series={[{ label: 'Appointments', values: points.map((p) => p.appointments), color: 's1' }]}
          fmtAxis={String}
          fmt={(v) => `${v} appointments`}
        />
        <BarsCard
          short
          title="Gross billing by month"
          note="Services plus retail. Hatched months are estimates."
          ariaLabel="Gross billing by month"
          themeKey={themeKey}
          labels={labels}
          estimate={estimate}
          series={[{ label: 'Gross billing', values: points.map((p) => dollars(p.grossCents)), color: 's2' }]}
          fmtAxis={kfmt}
          fmt={(v) => money(v * 100)}
        />
        <BarsCard
          short
          title="Days out of office"
          ariaLabel="Days out of office by month"
          themeKey={themeKey}
          labels={labels}
          series={[{ label: 'Days out', values: points.map((p) => p.daysOut), color: 's4' }]}
          fmtAxis={String}
          fmt={(v) => `${v} day${v === 1 ? '' : 's'}`}
          caption={
            perDay == null || !daysOut
              ? 'Add days out to each month’s totals to see what time off costs.'
              : `${daysOut} days out at your average of ${money(perDay)} a working day is about ${money(daysOut * perDay)} of production.`
          }
        />
        {visits.length > 0 && (
          <BarsCard
            short
            title="Busiest days of the week"
            note="Average visits on the days you worked, last 26 weeks."
            ariaLabel="Average visits per worked day by weekday"
            themeKey={themeKey}
            xHead="Day"
            labels={wd.map((d) => d.day)}
            series={[{ label: 'Visits per day', values: wd.map((d) => d.visitsPerDay), color: 's1' }]}
            fmtAxis={count}
            fmt={(v) => `${count(v)} visits a day`}
          />
        )}
        {visits.length > 0 && (
          <figure className="chart-card wide" aria-labelledby="cal-title" style={{ margin: 0 }}>
            <h3 id="cal-title">Last 26 weeks, day by day</h3>
            <p className="note">Each square is a day; darker means more visits.</p>
            <div className="cal-wrap" tabIndex={0} role="region" aria-label="Visits per day calendar">
              <div className="cal" style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 1fr)` }}>
                {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
                  <span
                    key={i}
                    className="cal-day"
                    style={{ gridRow: i + 1, gridColumn: 1 }}
                    aria-hidden="true"
                  >
                    {d}
                  </span>
                ))}
                {weeks.map((w, wi) =>
                  w.map((d, di) => (
                    <span
                      key={d.date}
                      className={`cal-cell ${d.inRange ? '' : 'out'}`}
                      style={{
                        gridRow: di + 1,
                        gridColumn: wi + 2,
                        background: d.visits
                          ? `color-mix(in srgb, var(--s1) ${Math.round(25 + (d.visits / max) * 75)}%, var(--surface))`
                          : undefined,
                      }}
                      title={`${fmtLongDate(d.date)}: ${d.visits} visit${d.visits === 1 ? '' : 's'}${d.visits ? `, ${money(d.grossCents)}` : ''}`}
                    />
                  )),
                )}
              </div>
            </div>
            <figcaption className="note">
              Busiest day:{' '}
              {(() => {
                const best = weeks.flat().reduce((a, b) => (b.visits > a.visits ? b : a));
                return best.visits ? `${fmtLongDate(best.date)} with ${best.visits} visits` : 'none yet';
              })()}
              .
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}

/* ---------- growth and mix ---------- */

export function GrowthSection(props: {
  visits: Visit[];
  catalogs: Catalogs;
  points: MonthPoint[];
  endYm: string;
  span: number;
  themeKey: string;
}) {
  const { visits, catalogs, points, endYm, span, themeKey } = props;
  const trend = visitTrend(visits, catalogs, endYm, span);
  const labels = trend.map((p) => p.label);
  const estimate = points.map((p) => p.source === 'estimate');
  const hasMix = points.some((p) => p.tox != null || p.filler != null || p.combo != null || p.other != null);
  return (
    <section className="ins-section" id="growth" aria-labelledby="growth-title">
      <SectionHead
        id="growth"
        title="Growth and mix"
        hint="What you do, what it earns, and where clients come from"
      />
      <div className="charts">
        <BarsCard
          title="Service mix"
          note="Visits by treatment type each month. Combo means tox and filler in one visit."
          ariaLabel="Visits by treatment type by month, stacked"
          themeKey={themeKey}
          labels={points.map((p) => p.label)}
          estimate={estimate}
          series={[
            { label: 'Tox', values: points.map((p) => p.tox), color: 's1' },
            { label: 'Filler', values: points.map((p) => p.filler), color: 's2' },
            { label: 'Combo', values: points.map((p) => p.combo), color: 's3' },
            { label: 'Other', values: points.map((p) => p.other), color: 's4' },
          ]}
          fmtAxis={String}
          fmt={(v) => `${v} visits`}
          caption={
            hasMix ? undefined : 'No treatment counts yet. Log visits, or add counts to the monthly totals.'
          }
        />
        <LinesCard
          title="Average ticket by treatment"
          note="Service billing per visit. Typical: tox $350–$500, filler $700–$1,200+."
          ariaLabel="Average ticket by treatment category by month"
          themeKey={themeKey}
          labels={labels}
          series={[
            { label: CATEGORY_LABEL.TOX, values: trend.map((p) => dollars(p.avgTicket.TOX)), color: 's1' },
            {
              label: CATEGORY_LABEL.FILLER,
              values: trend.map((p) => dollars(p.avgTicket.FILLER)),
              color: 's2',
            },
            { label: CATEGORY_LABEL.BIO, values: trend.map((p) => dollars(p.avgTicket.BIO)), color: 's3' },
          ]}
          fmtAxis={kfmt}
          fmt={(v) => money(v * 100)}
        />
        <LinesCard
          short
          title="Retail attach rate"
          note="Share of visits that added a skincare product."
          ariaLabel="Retail attach rate by month"
          themeKey={themeKey}
          labels={labels}
          series={[{ label: 'Retail attach', values: trend.map((p) => p.retailConversion), color: 's2' }]}
          fmtAxis={(v) => pct(v)}
          fmt={pct}
          max={1}
        />
        <BarsCard
          short
          title="Where clients come from"
          note="Share of each month’s visits. Self-sourced plus referral is your own book."
          ariaLabel="Share of visits by source by month, stacked"
          themeKey={themeKey}
          labels={labels}
          series={[
            {
              label: 'Clinic lead',
              values: trend.map((p) =>
                p.independence == null ? null : Math.round((1 - p.independence) * 100) / 100,
              ),
              color: 'muted',
            },
            { label: 'Self-sourced', values: trend.map((p) => p.selfSourcedShare), color: 's1' },
            { label: 'Referral', values: trend.map((p) => p.referralShare), color: 's3' },
          ]}
          fmtAxis={(v) => pct(v)}
          fmt={pct}
          max={1}
        />
      </div>
    </section>
  );
}
