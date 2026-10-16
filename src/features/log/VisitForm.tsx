import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { clearDraft, loadDraft, newId, nowISO, saveDraft, saveVisit, ValidationError } from '../../db/repo';
import { areaById, productById } from '../../domain/catalog';
import { knownClientIds, nextClientId, sameDayVisit } from '../../domain/clients';
import { todayISO } from '../../domain/dates';
import { fmtShortDate, money } from '../../domain/format';
import { normalizeClientId } from '../../domain/validation';
import { REBOOK_DAY_OPTIONS } from '../../domain/types';
import {
  applyArea,
  applyClientLookup,
  applyProduct,
  applyRetail,
  applySameAsLast,
  clientStatus,
  defaultForm,
  formToVisit,
  isDirty,
  lineFor,
  lineGross,
  nextLineKey,
  ticket as buildTicket,
  visitToForm,
  type FormErrors,
  type FormState,
} from '../../domain/visitForm';
import { requestPersist } from '../../pwa/storage';
import { Segmented } from '../../components/ui';
import { LiveTicket } from './LiveTicket';
import { PrivacyRules } from './PrivacyRules';
import { REBOOK_LABEL, SOURCE_OPTIONS, VISIT_TYPE_OPTIONS } from './labels';

const ID_HINT = 'Initials + client number. Never a name, phone or birthday.';

function isFormState(x: unknown): x is FormState {
  const f = x as FormState;
  return (
    !!f &&
    typeof f === 'object' &&
    typeof f.date === 'string' &&
    Array.isArray(f.lines) &&
    typeof f.area === 'string'
  );
}

export function VisitForm({ editing, onDone }: { editing: string | null; onDone: () => void }) {
  const { visits, catalogs } = useData();
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => defaultForm(catalogs, todayISO()));
  const [errors, setErrors] = useState<FormErrors>({});
  const [idBlurred, setIdBlurred] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftReady = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Restore an interrupted entry (LOG-15), unless we arrived to edit a visit.
  useEffect(() => {
    let alive = true;
    void loadDraft().then((d) => {
      if (!alive) return;
      if (!editing && isFormState(d) && isDirty(d, catalogs, todayISO())) {
        setF({ ...d, lines: d.lines.map((l) => ({ ...l, key: nextLineKey() })) });
        toast.show('Restored your unsaved entry');
      }
      draftReady.current = true;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LOG-13: load the visit being edited.
  useEffect(() => {
    if (!editing) return;
    const v = visits.find((x) => x.uid === editing);
    if (v) {
      setF(visitToForm(v));
      setErrors({});
      setDupWarning(null);
      formRef.current?.scrollIntoView({ block: 'start' });
    }
    // Only when the requested visit changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Keep a draft while she types.
  useEffect(() => {
    if (!draftReady.current) return;
    const t = setTimeout(() => {
      void (isDirty(f, catalogs, todayISO()) ? saveDraft(f) : clearDraft());
    }, 400);
    return () => clearTimeout(t);
  }, [f, catalogs]);

  const ticket = useMemo(() => buildTicket(f, catalogs), [f, catalogs]);
  const status = useMemo(() => clientStatus(f, visits), [f, visits]);
  const ids = useMemo(() => knownClientIds(visits), [visits]);
  const suggestion = /^[A-Z]{2,3}$/.test(f.clientId) ? nextClientId(visits, f.clientId) : null;
  const update = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));

  const reset = () => {
    setF(defaultForm(catalogs, todayISO()));
    setErrors({});
    setIdBlurred(false);
    setDupWarning(null);
    void clearDraft();
    if (editing) onDone();
  };

  const submit = async (force = false) => {
    const r = formToVisit(f, catalogs, { now: nowISO(), newId });
    if (!r.ok) {
      setErrors(r.errors);
      setIdBlurred(true);
      const first = Object.keys(r.errors)[0];
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    const dup = sameDayVisit(visits, r.visit.clientId, r.visit.date, f.uid ?? undefined);
    if (dup && !force) {
      setDupWarning(`${r.visit.clientId} already has a visit on ${fmtShortDate(r.visit.date)}. Save anyway?`);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveVisit(r.visit);
      void requestPersist();
      toast.show(`${f.uid ? 'Updated' : 'Saved'} ${saved.clientId} · ${money(saved.serviceGrossCents)}`);
      reset();
    } catch (e) {
      toast.show(e instanceof ValidationError ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const idError =
    status.kind === 'invalid' && (status.reason === 'identity' || idBlurred)
      ? status.message
      : errors.clientId;
  const activeAreas = catalogs.areas.filter((a) => a.active || a.id === f.area);
  const activeRetail = catalogs.retail.filter((r) => r.active || r.name === f.retailItem);

  return (
    <div className="log-grid">
      <form
        ref={formRef}
        className="panel"
        noValidate
        aria-labelledby="form-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-head">
          <h2 id="form-title">{f.uid ? 'Edit visit' : 'Log a visit'}</h2>
          <p>
            {f.uid
              ? 'Change any field, then save.'
              : 'Fill in after charting or at end of shift. About 60 seconds.'}
          </p>
        </div>

        <fieldset className="group">
          <legend className="eyebrow">Who &amp; when</legend>
          <div className="row">
            <div className="field">
              <label htmlFor="f-date">
                <span className="fnum">01</span>Date
              </label>
              <input
                id="f-date"
                data-field="date"
                type="date"
                value={f.date}
                max="2099-12-31"
                aria-invalid={errors.date ? true : undefined}
                onChange={(e) => setF((p) => applyClientLookup({ ...p, date: e.target.value }, visits))}
              />
              {errors.date && <span className="error">{errors.date}</span>}
            </div>
            <div className="field">
              <label htmlFor="f-id">
                <span className="fnum">02</span>Client ID (de-identified)
              </label>
              <input
                id="f-id"
                data-field="clientId"
                className="client-id"
                placeholder="CH-01"
                maxLength={12}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                list="known-ids"
                value={f.clientId}
                aria-invalid={idError ? true : undefined}
                aria-describedby="id-hint"
                onBlur={() => setIdBlurred(true)}
                onChange={(e) => {
                  setIdBlurred(false);
                  setDupWarning(null);
                  setErrors((x) => ({ ...x, clientId: undefined }));
                  setF((p) =>
                    applyClientLookup({ ...p, clientId: normalizeClientId(e.target.value) }, visits),
                  );
                }}
              />
              <datalist id="known-ids">
                {ids.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
              <div id="id-hint" aria-live="polite">
                {idError ? (
                  <span className="hint bad">{idError}</span>
                ) : status.kind === 'returning' ? (
                  <span className="hint ok">
                    Returning client. Last seen {fmtShortDate(status.prior.date)} for{' '}
                    {areaById(catalogs, status.prior.area)?.name ?? status.prior.area}.{' '}
                    <button
                      type="button"
                      className="btn link"
                      onClick={() => setF((p) => applySameAsLast(p, catalogs, status.prior))}
                    >
                      Same as last time
                    </button>
                  </span>
                ) : status.kind === 'new' ? (
                  <span className="hint">
                    New to this log. If she's seen this client before, enter the interval by hand.
                  </span>
                ) : suggestion ? (
                  <span className="hint">
                    <button
                      type="button"
                      className="btn link"
                      onClick={() => setF((p) => applyClientLookup({ ...p, clientId: suggestion }, visits))}
                    >
                      Use {suggestion}
                    </button>{' '}
                    (next free number for {f.clientId})
                  </span>
                ) : (
                  <span className="hint">{ID_HINT}</span>
                )}
              </div>
            </div>
          </div>
          <Segmented
            legend={
              <>
                <span className="fnum">03</span>Visit type
              </>
            }
            name="vtype"
            value={f.visitType}
            options={VISIT_TYPE_OPTIONS}
            onChange={(visitType) => update({ visitType })}
          />
          <Segmented
            legend={
              <>
                <span className="fnum">04</span>Source / attribution
              </>
            }
            name="source"
            value={f.source}
            options={SOURCE_OPTIONS}
            onChange={(source) => update({ source })}
          />
        </fieldset>

        <fieldset className="group">
          <legend className="eyebrow">Treatment</legend>
          <div className="field">
            <label htmlFor="f-area">
              <span className="fnum">05</span>Primary treatment area
            </label>
            <select
              id="f-area"
              data-field="area"
              value={f.area}
              onChange={(e) => setF((p) => applyArea(p, catalogs, e.target.value))}
            >
              {activeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="field">
            <legend>
              <span className="fnum">06</span>Product &amp; quantity
            </legend>
            <div className="prod-table">
              <div className="prod-row head" aria-hidden="true">
                <span>Product</span>
                <span>Qty</span>
                <span>$ / unit</span>
                <span style={{ textAlign: 'right' }}>Line</span>
                <span />
              </div>
              {f.lines.map((l, i) => {
                const p = productById(catalogs, l.productId);
                const n = i + 1;
                return (
                  <div className="prod-row" key={l.key}>
                    <select
                      aria-label={`Product ${n}`}
                      data-field={i === 0 ? 'products' : undefined}
                      value={l.productId}
                      onChange={(e) => setF((s) => applyProduct(s, catalogs, l.key, e.target.value))}
                    >
                      {catalogs.products
                        .filter((x) => x.active || x.id === l.productId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                    <div className="affix suffix">
                      <input
                        aria-label={`Quantity ${n} (${p?.unit ?? ''})`}
                        inputMode={p?.unit === 'mL' ? 'decimal' : 'numeric'}
                        className="mono"
                        value={l.qty}
                        onChange={(e) =>
                          setF((s) => ({
                            ...s,
                            lines: s.lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)),
                          }))
                        }
                      />
                      <span aria-hidden="true">{p?.unit}</span>
                    </div>
                    <div className="affix prefix">
                      <span aria-hidden="true">$</span>
                      <input
                        aria-label={`Price per unit ${n} in dollars`}
                        inputMode="decimal"
                        className="mono"
                        value={l.price}
                        onChange={(e) =>
                          setF((s) => ({
                            ...s,
                            lines: s.lines.map((x) =>
                              x.key === l.key ? { ...x, price: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                    </div>
                    <span className="line" aria-label={`Line ${n} total`}>
                      {money(lineGross(l))}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove product ${n}`}
                      onClick={() => setF((s) => ({ ...s, lines: s.lines.filter((x) => x.key !== l.key) }))}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            {errors.products && <span className="error">{errors.products}</span>}
            <div>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  const tox = areaById(catalogs, f.area)?.category === 'TOX';
                  const line = tox ? lineFor(catalogs, 'restylane-kysse', 1) : lineFor(catalogs, 'botox', 20);
                  setF((s) => ({ ...s, lines: [...s.lines, line] }));
                }}
              >
                + Add product
              </button>
            </div>
          </fieldset>
          <div className="row">
            <div className="field">
              <label htmlFor="f-retail">
                <span className="fnum">07</span>Skincare / retail add-on
              </label>
              <select
                id="f-retail"
                value={f.retailItem}
                onChange={(e) => setF((p) => applyRetail(p, catalogs, e.target.value))}
              >
                <option value="">None</option>
                {activeRetail.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({money(r.defaultPriceCents)})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-retail-price">Retail price ($)</label>
              <div className="affix prefix">
                <span aria-hidden="true">$</span>
                <input
                  id="f-retail-price"
                  data-field="retailPrice"
                  inputMode="decimal"
                  className="mono"
                  placeholder="0"
                  disabled={!f.retailItem}
                  value={f.retailPrice}
                  aria-invalid={errors.retailPrice ? true : undefined}
                  onChange={(e) => update({ retailPrice: e.target.value })}
                />
              </div>
              {errors.retailPrice && <span className="error">{errors.retailPrice}</span>}
            </div>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend className="eyebrow">Retention</legend>
          <div className="row">
            <Segmented
              legend={
                <>
                  <span className="fnum">09</span>Rebooked at checkout?
                </>
              }
              name="rebook"
              value={f.rebooked ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              onChange={(v) => update({ rebooked: v === 'yes' })}
            />
            {f.rebooked && (
              <div className="field">
                <label htmlFor="f-rebook-days">Rebooked for</label>
                <select
                  id="f-rebook-days"
                  value={f.rebookDays}
                  onChange={(e) => update({ rebookDays: Number(e.target.value) })}
                >
                  {REBOOK_DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {REBOOK_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="f-interval">
                <span className="fnum">10</span>Treatment interval (days)
              </label>
              <input
                id="f-interval"
                data-field="interval"
                inputMode="numeric"
                className="mono"
                placeholder="—"
                value={f.interval}
                aria-invalid={errors.interval ? true : undefined}
                aria-describedby="interval-hint"
                onChange={(e) =>
                  update({ interval: e.target.value.replace(/[^\d]/g, ''), intervalAuto: false })
                }
              />
              <span className="hint" id="interval-hint">
                {errors.interval ? (
                  <span className="error">{errors.interval}</span>
                ) : f.intervalAuto && status.kind === 'returning' ? (
                  `Auto-filled: ${status.interval} days since ${fmtShortDate(status.prior.date)}.`
                ) : (
                  "Days since this client's last visit. Filled in for you when the ID is already in the log."
                )}
              </span>
            </div>
          </div>
        </fieldset>

        {dupWarning && (
          <div className="callout warn" role="alert" style={{ marginTop: 18 }}>
            <span>{dupWarning}</span>
            <button type="button" className="btn small" onClick={() => void submit(true)}>
              Save anyway
            </button>
            <button type="button" className="btn small ghost" onClick={() => setDupWarning(null)}>
              Cancel
            </button>
          </div>
        )}

        <div className="actions" style={{ marginTop: 22 }}>
          <button type="submit" className="btn primary" disabled={saving}>
            {f.uid ? 'Save changes' : 'Save visit'}
          </button>
          <button type="button" className="btn ghost" onClick={reset}>
            {f.uid ? 'Cancel edit' : 'Clear form'}
          </button>
        </div>
      </form>

      <aside className="ticket" aria-label="Ticket preview">
        <LiveTicket form={f} ticket={ticket} />
        <div className="panel">
          <PrivacyRules />
        </div>
      </aside>
    </div>
  );
}
