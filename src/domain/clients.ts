import { areaCategory } from './catalog';
import { daysBetween } from './dates';
import type { Catalogs, ISODate, Visit } from './types';

/** Newest-first comparison: by date, then by creation time. */
export function byDateDesc(a: Visit, b: Visit): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

/**
 * The client's most recent visit on or before `date` (LOG-4), ignoring the visit being edited.
 * A same-day visit counts as prior only when it was created earlier.
 */
export function priorVisit(
  visits: readonly Visit[],
  clientId: string,
  date: ISODate,
  excludeUid?: string,
): Visit | undefined {
  let best: Visit | undefined;
  for (const v of visits) {
    if (v.clientId !== clientId || v.uid === excludeUid || v.date > date) continue;
    if (!best || byDateDesc(v, best) < 0) best = v;
  }
  return best;
}

export function sameDayVisit(
  visits: readonly Visit[],
  clientId: string,
  date: ISODate,
  excludeUid?: string,
): Visit | undefined {
  return visits.find((v) => v.clientId === clientId && v.date === date && v.uid !== excludeUid);
}

export function knownClientIds(visits: readonly Visit[]): string[] {
  return [...new Set(visits.map((v) => v.clientId))].sort();
}

/**
 * SUG-12: next free sequence number for the given initials.
 * "CH" with CH-01 and CH-02 in the log → "CH-03". Returns null if the initials are not 2–3 letters.
 */
export function nextClientId(visits: readonly Visit[], initials: string): string | null {
  const ini = initials.toUpperCase().replace(/[^A-Z]/g, '');
  if (!/^[A-Z]{2,3}$/.test(ini)) return null;
  let max = 0;
  let width = 2;
  for (const id of new Set(visits.map((v) => v.clientId))) {
    const m = /^([A-Z]{2,3})-(\d{2,3})$/.exec(id);
    if (m && m[1] === ini) {
      max = Math.max(max, Number(m[2]));
      width = Math.max(width, m[2]!.length);
    }
  }
  const next = max + 1;
  if (next > 999) return null;
  return `${ini}-${String(next).padStart(next > 99 ? 3 : width, '0')}`;
}

export interface ClientTimeline {
  clientId: string;
  visits: Visit[]; // oldest first
  totalServiceCents: number;
  totalRetailCents: number;
  firstDate: ISODate;
  lastDate: ISODate;
  rebookedCount: number;
  avgIntervalDays: number | null;
}

export function clientTimeline(visits: readonly Visit[], clientId: string): ClientTimeline | null {
  const vs = visits.filter((v) => v.clientId === clientId).sort((a, b) => -byDateDesc(a, b));
  if (!vs.length) return null;
  const intervals = vs.map((v) => v.intervalDays).filter((n): n is number => n != null);
  return {
    clientId,
    visits: vs,
    totalServiceCents: vs.reduce((s, v) => s + v.serviceGrossCents, 0),
    totalRetailCents: vs.reduce((s, v) => s + v.retailCents, 0),
    firstDate: vs[0]!.date,
    lastDate: vs[vs.length - 1]!.date,
    rebookedCount: vs.filter((v) => v.rebooked).length,
    avgIntervalDays: intervals.length ? intervals.reduce((s, n) => s + n, 0) / intervals.length : null,
  };
}

export interface DueForRebook {
  clientId: string;
  lastDate: ISODate;
  daysSince: number;
  area: string;
}

/**
 * SUG-7: clients whose most recent visit was a tox visit 90–120 days ago and who did not rebook.
 * Ordered most overdue first.
 */
export function dueForRebook(
  visits: readonly Visit[],
  catalogs: Catalogs,
  today: ISODate,
  window: { min: number; max: number } = { min: 90, max: 120 },
): DueForRebook[] {
  const latest = new Map<string, Visit>();
  for (const v of visits) {
    if (v.date > today) continue;
    const cur = latest.get(v.clientId);
    if (!cur || byDateDesc(v, cur) < 0) latest.set(v.clientId, v);
  }
  const out: DueForRebook[] = [];
  for (const v of latest.values()) {
    if (v.rebooked || areaCategory(catalogs, v.area) !== 'TOX') continue;
    const d = daysBetween(v.date, today);
    if (d >= window.min && d <= window.max)
      out.push({ clientId: v.clientId, lastDate: v.date, daysSince: d, area: v.area });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince || a.clientId.localeCompare(b.clientId));
}

export interface ClientSummary {
  clientId: string;
  visits: number;
  lastDate: ISODate;
  grossCents: number;
}

/** One row per client, most recently seen first. */
export function clientSummaries(visits: readonly Visit[]): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const v of visits) {
    const c = map.get(v.clientId) ?? { clientId: v.clientId, visits: 0, lastDate: v.date, grossCents: 0 };
    c.visits++;
    if (v.date > c.lastDate) c.lastDate = v.date;
    c.grossCents += v.serviceGrossCents + v.retailCents;
    map.set(v.clientId, c);
  }
  return [...map.values()].sort(
    (a, b) => b.lastDate.localeCompare(a.lastDate) || a.clientId.localeCompare(b.clientId),
  );
}
