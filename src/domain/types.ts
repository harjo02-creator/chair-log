/** Integer cents. All money in the app is stored and summed as cents. */
export type Cents = number;
/** Local calendar date as YYYY-MM-DD. No time zones. */
export type ISODate = string;
/** Calendar month as YYYY-MM. */
export type YearMonth = string;

export type VisitType = 'NEW_CONSULT' | 'REPEAT';
export type Source = 'CLINIC_LEAD' | 'SELF_SOURCED' | 'REFERRAL';
export type Unit = 'u' | 'mL' | 'vial' | 'syr' | 'tx';
/** OTHER: laser, facials, microneedling, consults and similar services that aren't injectables. */
export type Category = 'TOX' | 'FILLER' | 'BIO' | 'OTHER';
export type Theme = 'system' | 'light' | 'dark';

export const VISIT_TYPES: readonly VisitType[] = ['NEW_CONSULT', 'REPEAT'];
export const SOURCES: readonly Source[] = ['CLINIC_LEAD', 'SELF_SOURCED', 'REFERRAL'];
export const CATEGORIES: readonly Category[] = ['TOX', 'FILLER', 'BIO', 'OTHER'];
/** tx: one treatment or session (laser, facial, microneedling). */
export const UNITS: readonly Unit[] = ['u', 'mL', 'vial', 'syr', 'tx'];
export const REBOOK_DAY_OPTIONS = [14, 42, 90, 120, 180, 365] as const;

export const VISIT_TYPE_LABEL: Record<VisitType, string> = { NEW_CONSULT: 'New Consult', REPEAT: 'Repeat' };
export const SOURCE_LABEL: Record<Source, string> = {
  CLINIC_LEAD: 'Clinic Lead',
  SELF_SOURCED: 'Self-Sourced',
  REFERRAL: 'Referral',
};
export const CATEGORY_LABEL: Record<Category, string> = {
  TOX: 'Tox',
  FILLER: 'Filler',
  BIO: 'Biostimulator',
  OTHER: 'Other services',
};
export const DEFAULT_REBOOK_DAYS: Record<Category, number> = { TOX: 90, FILLER: 180, BIO: 42, OTHER: 42 };

export interface ProductLine {
  productId: string;
  nameSnapshot: string;
  unit: Unit;
  qty: number;
  /** Snapshot of the price when the visit was entered. Catalog changes never touch it. */
  unitPriceCents: Cents;
}

export interface Visit {
  uid: string;
  date: ISODate;
  clientId: string;
  visitType: VisitType;
  source: Source;
  /** TreatmentArea id. */
  area: string;
  products: ProductLine[];
  retailItem: string | null;
  retailCents: Cents;
  serviceGrossCents: Cents;
  rebooked: boolean;
  rebookDays: number | null;
  intervalDays: number | null;
  isSample: boolean;
  /**
   * Reconstructed from a booking calendar rather than logged at checkout: products and prices are
   * estimates, and rebook, source and retail weren't recorded. It counts toward appointments and
   * billing but is left out of the rebook, source and retail rates. Saving it from the form clears it.
   */
  estimated?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Sync bookkeeping: the updatedAt last confirmed by the shared log. Differs from updatedAt = unsynced. */
  syncedAt?: string;
}

/** Sync bookkeeping carried by catalog items (they predate sync, so both are optional). */
export interface SyncStamps {
  updatedAt?: string;
  syncedAt?: string;
}

export interface Product extends SyncStamps {
  id: string;
  name: string;
  unit: Unit;
  defaultUnitPriceCents: Cents;
  category: Category;
  qtyStep: number;
  active: boolean;
  /** Excluded from the "avg tox units" figure because its units are not comparable (Dysport). */
  excludeFromToxUnitAvg?: boolean;
}

export interface TreatmentArea extends SyncStamps {
  id: string;
  name: string;
  category: Category;
  defaultProductId: string;
  defaultQty: number;
  active: boolean;
}

export interface RetailItem extends SyncStamps {
  id: string;
  name: string;
  defaultPriceCents: Cents;
  active: boolean;
}

export interface PinRecord {
  saltB64: string;
  hashB64: string;
  iterations: number;
}

export interface Settings {
  id: 'settings';
  onboardingDone: boolean;
  rollingRetentionMonths: number;
  theme: Theme;
  lastBackupAt: string | null;
  schemaVersion: number;
  /** Backup reminder banner snoozed until this ISO datetime. */
  backupReminderSnoozedUntil: string | null;
  iosInstallHintDismissed: boolean;
  /** SUG-1 app lock. Null when no PIN is set. */
  pin: PinRecord | null;
  autoLockMinutes: number;
}

export interface Catalogs {
  products: Product[];
  areas: TreatmentArea[];
  retail: RetailItem[];
}
