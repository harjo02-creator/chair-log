import { Link } from 'react-router-dom';
import { areaName } from '../../domain/catalog';
import { productsLabel } from '../../domain/csv';
import { fmtShortDate, money, moneyExact } from '../../domain/format';
import { SOURCE_LABEL, type Catalogs, type Visit } from '../../domain/types';
import { ConfirmButton } from '../../components/ui';

export type SortKey = 'date' | 'gross';

export function VisitTable(props: {
  visits: Visit[];
  catalogs: Catalogs;
  onEdit: (v: Visit) => void;
  onDelete: (v: Visit) => void;
  showYear?: boolean;
  sort?: { key: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void };
  empty: string;
  caption: string;
}) {
  const { sort } = props;
  const sortHead = (key: SortKey, label: string, className = '') => {
    const ariaSort = sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
    return (
      <th className={className} aria-sort={ariaSort}>
        {sort ? (
          <button type="button" className="sort" onClick={() => sort.onSort(key)}>
            {label} {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
          </button>
        ) : (
          label
        )}
      </th>
    );
  };
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={`${props.caption} table`}>
      <table>
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            {sortHead('date', 'Date')}
            <th>Client</th>
            <th>Type</th>
            <th>Source</th>
            <th>Area</th>
            <th>Products</th>
            <th>Retail</th>
            {sortHead('gross', 'Gross', 'r')}
            <th>Rebook</th>
            <th className="r">Interval</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.visits.map((v) => (
            <tr key={v.uid}>
              <td>
                {props.showYear ? v.date : fmtShortDate(v.date)}
                {v.isSample && (
                  <span className="chip" style={{ marginLeft: 6 }}>
                    sample
                  </span>
                )}
                {v.estimated && (
                  <span
                    className="chip"
                    style={{ marginLeft: 6 }}
                    title="From the booking calendar: products and prices are estimates. Open and save it to confirm."
                  >
                    est.
                  </span>
                )}
              </td>
              <td>
                <Link className="client-link" to={`/clients/${encodeURIComponent(v.clientId)}`}>
                  {v.clientId}
                </Link>
              </td>
              <td>{v.visitType === 'REPEAT' ? 'Repeat' : 'New'}</td>
              <td>{SOURCE_LABEL[v.source]}</td>
              <td>{areaName(props.catalogs, v.area)}</td>
              <td>{productsLabel(v.products)}</td>
              <td>
                {v.retailItem ? (
                  `${v.retailItem} (${moneyExact(v.retailCents)})`
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="r mono">{money(v.serviceGrossCents)}</td>
              <td>
                {v.rebooked ? (
                  <span className="chip good">✓ Yes · {v.rebookDays}d</span>
                ) : (
                  <span className="chip warn">✕ No</span>
                )}
              </td>
              <td className="r mono">{v.intervalDays ?? '—'}</td>
              <td>
                <div className="actions" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => props.onEdit(v)}
                    aria-label={`Edit ${v.clientId} on ${v.date}`}
                  >
                    Edit
                  </button>
                  <ConfirmButton
                    label="Delete"
                    ariaLabel={`Delete ${v.clientId} on ${v.date}`}
                    onConfirm={() => props.onDelete(v)}
                  />
                </div>
              </td>
            </tr>
          ))}
          {!props.visits.length && (
            <tr>
              <td colSpan={11} className="muted">
                {props.empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
