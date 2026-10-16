import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { deleteVisit } from '../../db/repo';
import { monthOf } from '../../domain/dates';
import { money, monthName } from '../../domain/format';
import { monthsWithVisits } from '../../domain/metrics';
import { SOURCES, type Source } from '../../domain/types';
import { normalizeClientId } from '../../domain/validation';
import { sourceLabel } from '../log/labels';
import { VisitTable, type SortKey } from '../log/VisitTable';

const PAGE = 100;

/** LOG-14 */
export function HistoryPage() {
  const { visits, catalogs } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [month, setMonth] = useState('');
  const [client, setClient] = useState('');
  const [area, setArea] = useState('');
  const [source, setSource] = useState<Source | ''>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [limit, setLimit] = useState(PAGE);

  const months = useMemo(() => monthsWithVisits(visits), [visits]);
  const rows = useMemo(() => {
    const q = normalizeClientId(client);
    const out = visits.filter(
      (v) =>
        (!month || monthOf(v.date) === month) &&
        (!q || v.clientId.includes(q)) &&
        (!area || v.area === area) &&
        (!source || v.source === source),
    );
    const m = sort.dir === 'asc' ? 1 : -1;
    return out.sort((a, b) =>
      sort.key === 'date'
        ? m * (a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
        : m * (a.serviceGrossCents - b.serviceGrossCents) || b.date.localeCompare(a.date),
    );
  }, [visits, month, client, area, source, sort]);
  const total = rows.reduce((s, v) => s + v.serviceGrossCents, 0);

  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="section-head">
        <h2 id="history-title">History</h2>
        <Link to="/clients">Clients &amp; due for rebook →</Link>
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="h-month">Month</label>
          <select id="h-month" value={month} onChange={(e) => (setMonth(e.target.value), setLimit(PAGE))}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-client">Client ID</label>
          <input
            id="h-client"
            className="client-id"
            placeholder="CH-01"
            autoComplete="off"
            value={client}
            onChange={(e) => (setClient(normalizeClientId(e.target.value)), setLimit(PAGE))}
          />
        </div>
        <div className="field">
          <label htmlFor="h-area">Area</label>
          <select id="h-area" value={area} onChange={(e) => (setArea(e.target.value), setLimit(PAGE))}>
            <option value="">All areas</option>
            {catalogs.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-source">Source</label>
          <select
            id="h-source"
            value={source}
            onChange={(e) => (setSource(e.target.value as Source | ''), setLimit(PAGE))}
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint" aria-live="polite" style={{ marginBottom: 8 }}>
        {rows.length} visit{rows.length === 1 ? '' : 's'} · {money(total)} service gross
      </p>
      <VisitTable
        caption="All visits"
        visits={rows.slice(0, limit)}
        catalogs={catalogs}
        showYear
        empty={visits.length ? 'No visits match these filters.' : 'No visits yet.'}
        sort={{
          ...sort,
          onSort: (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' })),
        }}
        onEdit={(v) => navigate(`/log?edit=${v.uid}`)}
        onDelete={(v) => void deleteVisit(v.uid).then(() => toast.show('Entry deleted'))}
      />
      {rows.length > limit && (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE * 5)}>
            Show more ({rows.length - limit} left)
          </button>
        </div>
      )}
    </section>
  );
}
