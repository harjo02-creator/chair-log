/**
 * Deterministic demo data: ≈120 visits across the previous full month and the current month
 * up to yesterday, Tue–Sat chair days. Every visit is flagged isSample so it can be removed.
 */
import { areaById, productById } from '../domain/catalog';
import { addDays, daysBetween, monthStart, addMonths, monthOf, parseISODate } from '../domain/dates';
import { serviceGrossCents } from '../domain/validation';
import type { Catalogs, ISODate, ProductLine, Source, Visit } from '../domain/types';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSampleVisits(
  catalogs: Catalogs,
  today: ISODate,
  opts: { newId: () => string; now: string; seed?: number },
): Visit[] {
  const rnd = mulberry32(opts.seed ?? 20260915);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const weighted = <T>(pairs: [T, number][]): T => {
    let r = rnd() * pairs.reduce((s, p) => s + p[1], 0);
    for (const p of pairs) if ((r -= p[1]) <= 0) return p[0];
    return pairs[0]![0];
  };
  const LETTERS = 'ABCDEFGHJKLMNPRSTW';
  const seq: Record<string, number> = {};
  const clients: { id: string; source: Source; last: ISODate | null }[] = [];
  const newClient = () => {
    const ini = pick([...LETTERS]) + pick([...LETTERS]);
    seq[ini] = (seq[ini] ?? 0) + 1;
    const c = {
      id: `${ini}-${String(seq[ini]).padStart(2, '0')}`,
      source: weighted<Source>([
        ['CLINIC_LEAD', 44],
        ['SELF_SOURCED', 31],
        ['REFERRAL', 25],
      ]),
      last: null as ISODate | null,
    };
    clients.push(c);
    return c;
  };
  const line = (productId: string, qty: number): ProductLine | null => {
    const p = productById(catalogs, productId);
    return p
      ? { productId, nameSnapshot: p.name, unit: p.unit, qty, unitPriceCents: p.defaultUnitPriceCents }
      : null;
  };

  const visits: Visit[] = [];
  const start = monthStart(addMonths(monthOf(today), -1));
  const end = addDays(today, -1);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = parseISODate(d).getDay();
    if (dow === 0 || dow === 1) continue;
    const n = dow === 6 ? 5 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const isRepeat = rnd() < 0.6;
      const c = isRepeat && clients.length > 6 && rnd() < 0.35 ? pick(clients) : newClient();
      let visitType: Visit['visitType'] = 'NEW_CONSULT';
      let intervalDays: number | null = null;
      if (isRepeat) {
        visitType = 'REPEAT';
        intervalDays = c.last ? daysBetween(c.last, d) : 78 + Math.floor(rnd() * 60);
        if (intervalDays < 10) {
          visitType = 'NEW_CONSULT';
          intervalDays = null;
        }
      }
      if (c.last && visitType === 'NEW_CONSULT') {
        // A client already in the log is never a new consult.
        visitType = 'REPEAT';
        intervalDays = daysBetween(c.last, d);
      }
      const areaId = weighted<string>([
        ['upper-face-tox', 38],
        ['masseter-tox', 7],
        ['lower-face-tox', 5],
        ['lip-filler', 15],
        ['cheek-filler', 9],
        ['chin-jaw-filler', 6],
        ['tear-trough-filler', 5],
        ['biostimulator', 9],
      ]);
      const area = areaById(catalogs, areaId);
      if (!area) continue;
      const products: (ProductLine | null)[] = [];
      if (area.category === 'TOX') {
        const brand = weighted<string>([
          ['botox', 70],
          ['dysport', 18],
          ['xeomin', 12],
        ]);
        let u =
          areaId === 'upper-face-tox'
            ? 20 + Math.floor(rnd() * 13) * 3
            : areaId === 'masseter-tox'
              ? 40 + Math.floor(rnd() * 3) * 10
              : 8 + Math.floor(rnd() * 3) * 2;
        if (brand === 'dysport') u = Math.round((u * 2.5) / 5) * 5;
        products.push(line(brand, u));
        if (rnd() < 0.12) products.push(line('restylane-kysse', 1));
      } else if (area.category === 'FILLER') {
        const pid = areaId === 'lip-filler' && rnd() < 0.35 ? 'juvederm-volbella' : area.defaultProductId;
        const small = areaId === 'lip-filler' || areaId === 'tear-trough-filler';
        products.push(line(pid, small ? (rnd() < 0.2 ? 0.5 : 1) : 1 + Math.floor(rnd() * 3)));
        if (rnd() < 0.25) products.push(line('botox', 20 + Math.floor(rnd() * 6) * 4));
      } else {
        products.push(
          rnd() < 0.7
            ? line('sculptra', 1 + Math.floor(rnd() * 2))
            : line('radiesse', 1 + Math.floor(rnd() * 2)),
        );
      }
      const lines = products.filter((p): p is ProductLine => p != null);
      if (!lines.length) continue;
      const retail = rnd() < 0.27 ? pick(catalogs.retail) : null;
      const rebookP = area.category === 'TOX' ? 0.74 : area.category === 'BIO' ? 0.7 : 0.45;
      const rebooked = rnd() < rebookP;
      const rebookDays = rebooked
        ? area.category === 'TOX'
          ? rnd() < 0.8
            ? 90
            : 120
          : area.category === 'BIO'
            ? 42
            : 180
        : null;
      visits.push({
        uid: opts.newId(),
        date: d,
        clientId: c.id,
        visitType,
        source: c.source,
        area: areaId,
        products: lines,
        retailItem: retail?.name ?? null,
        retailCents: retail?.defaultPriceCents ?? 0,
        serviceGrossCents: serviceGrossCents(lines),
        rebooked,
        rebookDays,
        intervalDays,
        isSample: true,
        createdAt: opts.now,
        updatedAt: opts.now,
      });
      c.last = d;
    }
  }
  return visits;
}
