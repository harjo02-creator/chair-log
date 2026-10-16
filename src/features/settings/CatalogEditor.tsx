import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { resetCatalogs, upsertArea, upsertProduct, upsertRetail } from '../../db/repo';
import { slugify } from '../../domain/catalog';
import { centsToInput, parseDollars } from '../../domain/format';
import { CATEGORIES, CATEGORY_LABEL, UNITS, type Category, type Unit } from '../../domain/types';
import { ConfirmButton } from '../../components/ui';

/** Commits on blur so typing doesn't write on every keystroke. */
function MoneyCell({
  cents,
  label,
  onCommit,
}: {
  cents: number;
  label: string;
  onCommit: (c: number) => void;
}) {
  const [v, setV] = useState(centsToInput(cents));
  const [bad, setBad] = useState(false);
  return (
    <div className="affix prefix">
      <span aria-hidden="true">$</span>
      <input
        aria-label={label}
        inputMode="decimal"
        className="mono"
        value={v}
        aria-invalid={bad || undefined}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const c = parseDollars(v);
          setBad(c == null);
          if (c != null && c !== cents) onCommit(c);
        }}
      />
    </div>
  );
}

function TextCell({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <input
      aria-label={label}
      value={v}
      maxLength={40}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim();
        if (t && t !== value) onCommit(t);
        else setV(value);
      }}
    />
  );
}

const uniqueId = (name: string, taken: string[]) => {
  const base = slugify(name);
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
};

export function CatalogEditor() {
  const { catalogs } = useData();
  const toast = useToast();
  const saved = () => toast.show('Saved. Past visits keep the price they were logged at.');
  const { products, areas, retail } = catalogs;

  return (
    <>
      <section className="panel" aria-labelledby="prod-cat">
        <h2 id="prod-cat">Products &amp; prices</h2>
        <p className="hint">
          Prices fill in new visits. Changing a price never changes visits already saved. Turn a product off
          to hide it from the form without losing its history.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Products and prices">
          <table className="cat-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Category</th>
                <th>$ / unit</th>
                <th>In use</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <TextCell
                      value={p.name}
                      label={`${p.name} name`}
                      onCommit={(name) => void upsertProduct({ ...p, name }).then(saved)}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`${p.name} unit`}
                      value={p.unit}
                      onChange={(e) => {
                        const unit = e.target.value as Unit;
                        void upsertProduct({ ...p, unit, qtyStep: unit === 'mL' ? 0.1 : 1 }).then(saved);
                      }}
                    >
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${p.name} category`}
                      value={p.category}
                      onChange={(e) =>
                        void upsertProduct({ ...p, category: e.target.value as Category }).then(saved)
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <MoneyCell
                      cents={p.defaultUnitPriceCents}
                      label={`${p.name} price per ${p.unit}`}
                      onCommit={(c) => void upsertProduct({ ...p, defaultUnitPriceCents: c }).then(saved)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${p.name} in use`}
                      checked={p.active}
                      onChange={(e) => void upsertProduct({ ...p, active: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddRow
          placeholder="New product name"
          onAdd={(name) =>
            upsertProduct({
              id: uniqueId(
                name,
                products.map((x) => x.id),
              ),
              name,
              unit: 'u',
              defaultUnitPriceCents: 0,
              category: 'TOX',
              qtyStep: 1,
              active: true,
            })
          }
        />
      </section>

      <section className="panel" aria-labelledby="area-cat">
        <h2 id="area-cat">Treatment areas</h2>
        <p className="hint">
          Each area pre-fills one product line and sets the default rebook (tox 90, filler 180, biostimulator
          42 days).
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Treatment areas">
          <table className="cat-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Category</th>
                <th>Default product</th>
                <th>Default qty</th>
                <th>In use</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>
                    <TextCell
                      value={a.name}
                      label={`${a.name} name`}
                      onCommit={(name) => void upsertArea({ ...a, name }).then(saved)}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`${a.name} category`}
                      value={a.category}
                      onChange={(e) =>
                        void upsertArea({ ...a, category: e.target.value as Category }).then(saved)
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${a.name} default product`}
                      value={a.defaultProductId}
                      onChange={(e) =>
                        void upsertArea({ ...a, defaultProductId: e.target.value }).then(saved)
                      }
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`${a.name} default quantity`}
                      inputMode="decimal"
                      className="mono"
                      defaultValue={a.defaultQty}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n > 0 && n !== a.defaultQty) void upsertArea({ ...a, defaultQty: n }).then(saved);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${a.name} in use`}
                      checked={a.active}
                      onChange={(e) => void upsertArea({ ...a, active: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddRow
          placeholder="New treatment area"
          onAdd={(name) =>
            upsertArea({
              id: uniqueId(
                name,
                areas.map((x) => x.id),
              ),
              name,
              category: 'TOX',
              defaultProductId: products[0]?.id ?? 'botox',
              defaultQty: 20,
              active: true,
            })
          }
        />
      </section>

      <section className="panel" aria-labelledby="retail-cat">
        <h2 id="retail-cat">Retail &amp; skincare</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Retail items">
          <table className="cat-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
                <th>In use</th>
              </tr>
            </thead>
            <tbody>
              {retail.map((r) => (
                <tr key={r.id}>
                  <td>
                    <TextCell
                      value={r.name}
                      label={`${r.name} name`}
                      onCommit={(name) => void upsertRetail({ ...r, name }).then(saved)}
                    />
                  </td>
                  <td>
                    <MoneyCell
                      cents={r.defaultPriceCents}
                      label={`${r.name} price`}
                      onCommit={(c) => void upsertRetail({ ...r, defaultPriceCents: c }).then(saved)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${r.name} in use`}
                      checked={r.active}
                      onChange={(e) => void upsertRetail({ ...r, active: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddRow
          placeholder="New retail item"
          onAdd={(name) =>
            upsertRetail({
              id: uniqueId(
                name,
                retail.map((x) => x.id),
              ),
              name,
              defaultPriceCents: 0,
              active: true,
            })
          }
        />
        <div className="actions">
          <ConfirmButton
            label="Reset all lists to defaults"
            confirmLabel="Tap again to reset"
            onConfirm={() =>
              void resetCatalogs().then(() => toast.show('Lists reset. Saved visits are unchanged.'))
            }
          />
        </div>
      </section>
    </>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="actions"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (n) void onAdd(n).then(() => setName(''));
      }}
    >
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        style={{ maxWidth: 260 }}
      />
      <button type="submit" className="btn small" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
