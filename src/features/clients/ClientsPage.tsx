import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../../app/data';
import { areaName } from '../../domain/catalog';
import { clientSummaries, clientTimeline, dueForRebook } from '../../domain/clients';
import { productsLabel } from '../../domain/csv';
import { todayISO } from '../../domain/dates';
import { fmtLongDate, money } from '../../domain/format';
import { normalizeClientId } from '../../domain/validation';
import { Empty } from '../../components/ui';
import { sourceLabel } from '../log/labels';

/** SUG-7 due-for-rebook list plus every client in the log. */
export function ClientsPage() {
  const { visits, catalogs } = useData();
  const [q, setQ] = useState('');
  const due = useMemo(() => dueForRebook(visits, catalogs, todayISO()), [visits, catalogs]);
  const clients = useMemo(() => clientSummaries(visits), [visits]);
  const shown = clients.filter((c) => c.clientId.includes(normalizeClientId(q)));

  return (
    <>
      <section className="panel" aria-labelledby="due-title">
        <div className="section-head">
          <h2 id="due-title">Due for rebook</h2>
          <span className="hint">Last visit was tox, 90–120 days ago, and they didn't rebook</span>
        </div>
        {due.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Clients due for rebook">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Last visit</th>
                  <th className="r">Days since</th>
                  <th>Area</th>
                </tr>
              </thead>
              <tbody>
                {due.map((d) => (
                  <tr key={d.clientId}>
                    <td>
                      <Link className="client-link" to={`/clients/${encodeURIComponent(d.clientId)}`}>
                        {d.clientId}
                      </Link>
                    </td>
                    <td>{fmtLongDate(d.lastDate)}</td>
                    <td className="r mono">{d.daysSince}</td>
                    <td>{areaName(catalogs, d.area)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">Nobody is due right now.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="clients-title">
        <div className="section-head">
          <h2 id="clients-title">Clients</h2>
          <span className="hint">{clients.length} in log</span>
        </div>
        <div className="field" style={{ maxWidth: 240, marginBottom: 12 }}>
          <label htmlFor="c-q">Find a client ID</label>
          <input
            id="c-q"
            className="client-id"
            placeholder="CH"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="All clients">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="r">Visits</th>
                <th>Last visit</th>
                <th className="r">Total gross</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((c) => (
                <tr key={c.clientId}>
                  <td>
                    <Link className="client-link" to={`/clients/${encodeURIComponent(c.clientId)}`}>
                      {c.clientId}
                    </Link>
                  </td>
                  <td className="r mono">{c.visits}</td>
                  <td>{fmtLongDate(c.lastDate)}</td>
                  <td className="r mono">{money(c.grossCents)}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    No clients match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** Client timeline (SHOULD, §6). */
export function ClientPage() {
  const { clientId = '' } = useParams();
  const { visits, catalogs } = useData();
  const navigate = useNavigate();
  const t = useMemo(() => clientTimeline(visits, clientId), [visits, clientId]);
  if (!t)
    return (
      <section className="panel">
        <Empty>
          <p>No visits for {clientId}.</p>
          <Link to="/clients">Back to clients</Link>
        </Empty>
      </section>
    );
  return (
    <section className="panel" aria-labelledby="client-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Client timeline</div>
          <h2 id="client-title" className="mono">
            {t.clientId}
          </h2>
        </div>
        <Link to="/clients">All clients</Link>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Tile label="Visits" value={String(t.visits.length)} sub={`Since ${fmtLongDate(t.firstDate)}`} />
        <Tile
          label="Total service gross"
          value={money(t.totalServiceCents)}
          sub={`${money(t.totalRetailCents)} retail`}
        />
        <Tile label="Rebooked" value={`${t.rebookedCount} of ${t.visits.length}`} sub="at checkout" />
        <Tile
          label="Avg interval"
          value={t.avgIntervalDays == null ? '—' : `${t.avgIntervalDays.toFixed(0)} d`}
          sub="between visits"
        />
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Client visits">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="r">Interval</th>
              <th>Type</th>
              <th>Source</th>
              <th>Area</th>
              <th>Products</th>
              <th className="r">Gross</th>
              <th>Rebook</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.visits.map((v) => (
              <tr key={v.uid}>
                <td>{fmtLongDate(v.date)}</td>
                <td className="r mono">{v.intervalDays ?? '—'}</td>
                <td>{v.visitType === 'REPEAT' ? 'Repeat' : 'New'}</td>
                <td>{sourceLabel(v.source)}</td>
                <td>{areaName(catalogs, v.area)}</td>
                <td>{productsLabel(v.products)}</td>
                <td className="r mono">{money(v.serviceGrossCents)}</td>
                <td>
                  {v.rebooked ? (
                    <span className="chip good">✓ {v.rebookDays}d</span>
                  ) : (
                    <span className="chip warn">✕ No</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => navigate(`/log?edit=${v.uid}`)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <span className="eyebrow">{label}</span>
      <span className="v">{value}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}
