import type { Catalogs, Category, Product, RetailItem, TreatmentArea } from './types';

const p = (
  id: string,
  name: string,
  unit: Product['unit'],
  dollars: number,
  category: Category,
  qtyStep: number,
  extra: Partial<Product> = {},
): Product => ({
  id,
  name,
  unit,
  defaultUnitPriceCents: Math.round(dollars * 100),
  category,
  qtyStep,
  active: true,
  ...extra,
});

export const DEFAULT_PRODUCTS: Product[] = [
  p('botox', 'Botox', 'u', 13, 'TOX', 1),
  p('dysport', 'Dysport', 'u', 4.5, 'TOX', 5, { excludeFromToxUnitAvg: true }),
  p('xeomin', 'Xeomin', 'u', 12, 'TOX', 1),
  p('daxxify', 'Daxxify', 'u', 8, 'TOX', 5),
  p('restylane-kysse', 'Restylane Kysse', 'mL', 750, 'FILLER', 0.1),
  p('juvederm-volbella', 'Juvéderm Volbella', 'mL', 700, 'FILLER', 0.1),
  p('juvederm-voluma', 'Juvéderm Voluma', 'mL', 850, 'FILLER', 0.1),
  p('rha-4', 'RHA 4', 'mL', 800, 'FILLER', 0.1),
  p('restylane-eyelight', 'Restylane Eyelight', 'mL', 750, 'FILLER', 0.1),
  p('sculptra', 'Sculptra', 'vial', 900, 'BIO', 1),
  p('radiesse', 'Radiesse', 'syr', 850, 'BIO', 1),
];

const a = (
  id: string,
  name: string,
  category: Category,
  defaultProductId: string,
  defaultQty: number,
): TreatmentArea => ({
  id,
  name,
  category,
  defaultProductId,
  defaultQty,
  active: true,
});

export const DEFAULT_AREAS: TreatmentArea[] = [
  a('upper-face-tox', 'Upper Face Tox', 'TOX', 'botox', 36),
  a('masseter-tox', 'Masseter Tox', 'TOX', 'botox', 50),
  a('lower-face-tox', 'Lip Flip / Lower Face Tox', 'TOX', 'botox', 12),
  a('lip-filler', 'Lip Filler', 'FILLER', 'restylane-kysse', 1),
  a('cheek-filler', 'Cheek Filler', 'FILLER', 'juvederm-voluma', 2),
  a('chin-jaw-filler', 'Chin & Jawline Filler', 'FILLER', 'rha-4', 2),
  a('tear-trough-filler', 'Tear Trough Filler', 'FILLER', 'restylane-eyelight', 1),
  a('biostimulator', 'Biostimulator', 'BIO', 'sculptra', 2),
];

const r = (id: string, name: string, dollars: number): RetailItem => ({
  id,
  name,
  defaultPriceCents: dollars * 100,
  active: true,
});

export const DEFAULT_RETAIL: RetailItem[] = [
  r('growth-factor-serum', 'Growth Factor Serum', 180),
  r('hyaluronic-serum', 'Hyaluronic Hydrating Serum', 120),
  r('retinol-cream', 'Retinol 0.5% Cream', 95),
  r('mineral-spf', 'Tinted Mineral SPF 46', 58),
  r('peptide-lip', 'Peptide Lip Treatment', 32),
];

export const DEFAULT_CATALOGS: Catalogs = {
  products: DEFAULT_PRODUCTS,
  areas: DEFAULT_AREAS,
  retail: DEFAULT_RETAIL,
};

export const DEFAULT_AREA_ID = 'upper-face-tox';

export function areaById(c: Catalogs, id: string): TreatmentArea | undefined {
  return c.areas.find((x) => x.id === id);
}

export function productById(c: Catalogs, id: string): Product | undefined {
  return c.products.find((x) => x.id === id);
}

export function areaName(c: Catalogs, id: string): string {
  return areaById(c, id)?.name ?? id;
}

/** Category of a treatment area; unknown areas count as neither tox nor filler. */
export function areaCategory(c: Catalogs, id: string): Category | null {
  return areaById(c, id)?.category ?? null;
}

/** Retail item name stored on visits is the item name (it is shown and exported as-is). */
export function retailByName(c: Catalogs, name: string): RetailItem | undefined {
  return c.retail.find((x) => x.name === name);
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}
