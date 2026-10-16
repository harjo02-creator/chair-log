import { fmtQty, money, moneyExact } from '../../domain/format';
import type { FormState, Ticket } from '../../domain/visitForm';
import { SOURCE_LABEL } from '../../domain/types';
import { REBOOK_LABEL } from './labels';

/** LOG-10 */
export function LiveTicket({ form, ticket }: { form: FormState; ticket: Ticket }) {
  return (
    <section className="panel" aria-labelledby="tk-title">
      <div className="eyebrow" id="tk-title">
        Live ticket
      </div>
      <div className="tk-id">{form.clientId || '—'}</div>
      <div className="chips">
        <span className="chip accent">{form.visitType === 'REPEAT' ? 'Repeat' : 'New Consult'}</span>
        <span className="chip">{SOURCE_LABEL[form.source]}</span>
        {form.rebooked ? (
          <span className="chip good">✓ Rebooked {REBOOK_LABEL[form.rebookDays]?.split(' (')[0]}</span>
        ) : (
          <span className="chip warn">✕ Not rebooked</span>
        )}
      </div>
      <div className="tk-lines">
        {ticket.lines.map((l) => (
          <div key={l.key}>
            <span>
              {l.label} {fmtQty(l.qty, l.unit)}{' '}
              <span className="muted">× {moneyExact(l.unitPriceCents)}</span>
            </span>
            <span>{money(l.grossCents)}</span>
          </div>
        ))}
        {!ticket.lines.length && (
          <div className="muted">
            <span>No products yet</span>
            <span />
          </div>
        )}
        {form.retailItem && (
          <div className="muted">
            <span>Retail: {form.retailItem}</span>
            <span>{moneyExact(ticket.retailCents)}</span>
          </div>
        )}
      </div>
      <div className="tk-total" aria-live="polite">
        <span>
          <span className="fnum">08</span>Est. ticket gross
        </span>
        <b>{money(ticket.serviceCents)}</b>
      </div>
      <span className="hint">Service only, retail tracked separately</span>
    </section>
  );
}
