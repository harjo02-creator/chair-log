/**
 * Ten hand-checked visits in September 2026 (acceptance criterion 5).
 * Expected values are worked out by hand in EXPECTED below; do not derive them from the code.
 */
import { DEFAULT_CATALOGS, productById } from '../../src/domain/catalog';
import { serviceGrossCents } from '../../src/domain/validation';
import type { ProductLine, Source, Visit, VisitType } from '../../src/domain/types';

const line = (productId: string, qty: number): ProductLine => {
  const p = productById(DEFAULT_CATALOGS, productId)!;
  return { productId, nameSnapshot: p.name, unit: p.unit, qty, unitPriceCents: p.defaultUnitPriceCents };
};

let n = 0;
const v = (
  date: string,
  clientId: string,
  visitType: VisitType,
  source: Source,
  area: string,
  products: ProductLine[],
  opts: { retail?: [string, number]; rebook?: number; interval?: number } = {},
): Visit => ({
  uid: `fx-${++n}`,
  date,
  clientId,
  visitType,
  source,
  area,
  products,
  retailItem: opts.retail?.[0] ?? null,
  retailCents: opts.retail?.[1] ?? 0,
  serviceGrossCents: serviceGrossCents(products),
  rebooked: opts.rebook != null,
  rebookDays: opts.rebook ?? null,
  intervalDays: opts.interval ?? null,
  isSample: false,
  createdAt: `${date}T18:00:0${n % 10}.000Z`,
  updatedAt: `${date}T18:00:0${n % 10}.000Z`,
});

export const SEPTEMBER_VISITS: Visit[] = [
  v('2026-09-02', 'AB-01', 'NEW_CONSULT', 'CLINIC_LEAD', 'upper-face-tox', [line('botox', 36)], {
    rebook: 90,
  }),
  v('2026-09-02', 'CD-01', 'REPEAT', 'SELF_SOURCED', 'upper-face-tox', [line('botox', 40)], {
    rebook: 90,
    retail: ['Growth Factor Serum', 18000],
    interval: 95,
  }),
  v('2026-09-05', 'EF-01', 'NEW_CONSULT', 'REFERRAL', 'lip-filler', [line('restylane-kysse', 1)]),
  v('2026-09-09', 'CD-01', 'REPEAT', 'SELF_SOURCED', 'lip-filler', [line('restylane-kysse', 1)], {
    rebook: 180,
    interval: 7,
  }),
  v('2026-09-12', 'GH-01', 'REPEAT', 'CLINIC_LEAD', 'upper-face-tox', [line('dysport', 60)], {
    interval: 130,
  }),
  v('2026-09-12', 'JK-01', 'NEW_CONSULT', 'CLINIC_LEAD', 'biostimulator', [line('sculptra', 2)], {
    rebook: 42,
    retail: ['Tinted Mineral SPF 46', 5800],
  }),
  v('2026-09-16', 'LM-01', 'REPEAT', 'REFERRAL', 'masseter-tox', [line('botox', 50)], {
    rebook: 90,
    interval: 88,
  }),
  v('2026-09-19', 'AB-01', 'REPEAT', 'CLINIC_LEAD', 'upper-face-tox', [line('botox', 30)], {
    rebook: 90,
    interval: 17,
  }),
  v('2026-09-23', 'NP-01', 'NEW_CONSULT', 'SELF_SOURCED', 'cheek-filler', [line('juvederm-voluma', 2)], {
    retail: ['Hyaluronic Hydrating Serum', 12000],
  }),
  v(
    '2026-09-30',
    'RS-01',
    'REPEAT',
    'SELF_SOURCED',
    'upper-face-tox',
    [line('botox', 36), line('restylane-kysse', 1)],
    {
      rebook: 90,
      interval: 110,
    },
  ),
];

/** Worked out by hand from the table above. */
export const EXPECTED = {
  n: 10,
  serviceCents: 851_600, // 468+520+750+750+270+1800+650+390+1700+1218 dollars
  retailCents: 35_800, // 180 + 58 + 120
  grossCents: 887_400,
  chairDays: 8,
  perDay: 1.25,
  avgTicketCents: 85_160, // $851.60 → "$852"
  uniqueClients: 8,
  returningClients: 5, // CD, GH, LM, AB, RS
  newClients: 3,
  retention: 5 / 8, // 63%
  rebookedCount: 7,
  rebookRate: 0.7,
  selfSourcedCount: 4,
  referralCount: 2,
  independence: 0.6,
  retailCount: 3,
  retailConversion: 0.3,
  toxRepeatCount: 5, // intervals 95, 130, 88, 17, 110
  toxInWindowCount: 2, // 95, 110
  toxCadence: 0.4,
  avgToxUnits: 38.4, // (36+40+50+30+36)/5, Dysport excluded
  cadenceBuckets: [1, 1, 1, 1, 1, 0],
  weeks: [
    { label: 'Sep 1–6', serviceCents: 173_800, retailCents: 18_000, newCount: 2, repeatCount: 1 },
    { label: 'Sep 7–13', serviceCents: 282_000, retailCents: 5_800, newCount: 1, repeatCount: 2 },
    { label: 'Sep 14–20', serviceCents: 104_000, retailCents: 0, newCount: 0, repeatCount: 2 },
    { label: 'Sep 21–27', serviceCents: 170_000, retailCents: 12_000, newCount: 1, repeatCount: 0 },
    { label: 'Sep 28–30', serviceCents: 121_800, retailCents: 0, newCount: 0, repeatCount: 1 },
  ],
  sources: { CLINIC_LEAD: 4, SELF_SOURCED: 4, REFERRAL: 2 },
  toxAvgTicketCents: 58_600, // 3516 / 6
  fillerAvgTicketCents: 320_000 / 3,
  products: [
    { productId: 'botox', visits: 5, totalQty: 192, grossCents: 249_600 },
    { productId: 'restylane-kysse', visits: 3, totalQty: 3, grossCents: 225_000 },
    { productId: 'sculptra', visits: 1, totalQty: 2, grossCents: 180_000 },
    { productId: 'juvederm-voluma', visits: 1, totalQty: 2, grossCents: 170_000 },
    { productId: 'dysport', visits: 1, totalQty: 60, grossCents: 27_000 },
  ],
  mixOrder: ['upper-face-tox', 'biostimulator', 'cheek-filler', 'lip-filler', 'masseter-tox'],
};

/** Builders for tests that need their own visits. */
export { v as makeVisit, line as makeLine };
