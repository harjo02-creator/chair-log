/**
 * Two-way sync between this device's IndexedDB and the shared log.
 *
 * A record is unsynced when its `updatedAt` differs from its `syncedAt` (the version the shared log
 * last confirmed). Deletions travel as tombstones. Push sends unsynced records and tombstones; the
 * server keeps whichever version has the newer `updatedAt`. Pull fetches rows the server changed
 * since this device's cursor and applies them unless this device holds a newer unsynced edit.
 * Sample visits never leave the device.
 */
import type { ChairLogDB, SyncTable, Tombstone } from '../db/db';

export const SYNC_TABLES: readonly SyncTable[] = [
  'products',
  'areas',
  'retail',
  'goals',
  'monthRecords',
  'visits',
];

export const KEY_FIELD: Record<SyncTable, string> = {
  visits: 'uid',
  products: 'id',
  areas: 'id',
  retail: 'id',
  monthRecords: 'month',
  goals: 'metric',
};

export type SyncData = Record<string, unknown> & { updatedAt?: string; deletedAt?: string };

export interface RemoteRow {
  key: string;
  data: SyncData;
  /** Server time the row last changed; the pull cursor. */
  serverAt: string;
  deleted: boolean;
}

/** The shared log, as the engine sees it. Supabase in the app, an in-memory fake in tests. */
export interface Remote {
  /** Rows changed after `since` (all of them when null), oldest change first. */
  pull(table: SyncTable, since: string | null): Promise<RemoteRow[]>;
  push(table: SyncTable, rows: { key: string; data: SyncData }[]): Promise<void>;
}

type Row = SyncData & { syncedAt?: string; isSample?: boolean };

/** Rows overlap by this much between pulls, so a slow transaction committed late isn't skipped. */
const PULL_OVERLAP_MS = 10_000;
const PUSH_CHUNK = 500;

export const isUnsynced = (r: Row) => !r.isSample && r.updatedAt != null && r.updatedAt !== r.syncedAt;

const withoutBookkeeping = (r: Row): SyncData => {
  const data: Row = { ...r };
  delete data.syncedAt;
  return data;
};

const table = (d: ChairLogDB, t: SyncTable) => d.table<Row, string>(t);

/** Unsynced records plus tombstones waiting to go out. */
export async function pendingCount(d: ChairLogDB): Promise<number> {
  let n = await d.tombstones.count();
  for (const t of SYNC_TABLES) n += await table(d, t).filter(isUnsynced).count();
  return n;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export async function syncOnce(d: ChairLogDB, remote: Remote): Promise<SyncResult> {
  const state = await d.syncState.get('state');
  if (!state) throw new Error('Not linked to a shared log');
  const cursors = { ...state.cursors };
  let pushed = 0;
  let pulled = 0;

  for (const t of SYNC_TABLES) {
    const key = KEY_FIELD[t];

    /* ---------- push ---------- */
    const rows = await table(d, t).filter(isUnsynced).toArray();
    const tombs = await d.tombstones.where('table').equals(t).toArray();
    const payload = [
      ...rows.map((r) => ({ key: String(r[key]), data: withoutBookkeeping(r) })),
      ...tombs.map((tb) => ({
        key: tb.id,
        data: { [key]: tb.id, updatedAt: tb.deletedAt, deletedAt: tb.deletedAt },
      })),
    ];
    for (let i = 0; i < payload.length; i += PUSH_CHUNK)
      await remote.push(t, payload.slice(i, i + PUSH_CHUNK));
    if (payload.length) {
      await d.transaction('rw', table(d, t), d.tombstones, async () => {
        for (const r of rows) {
          const cur = await table(d, t).get(String(r[key]));
          // Only mark it synced if it wasn't edited again while the push was in flight.
          if (cur && cur.updatedAt === r.updatedAt)
            await table(d, t).put({ ...cur, syncedAt: cur.updatedAt });
        }
        for (const tb of tombs) {
          const cur = await d.tombstones.get(tb.key);
          if (cur && cur.deletedAt === tb.deletedAt) await d.tombstones.delete(tb.key);
        }
      });
      pushed += payload.length;
    }

    /* ---------- pull ---------- */
    const since = cursors[t] ? new Date(Date.parse(cursors[t]!) - PULL_OVERLAP_MS).toISOString() : null;
    const incoming = await remote.pull(t, since);
    if (!incoming.length) continue;
    await d.transaction('rw', table(d, t), d.tombstones, async () => {
      for (const rr of incoming) {
        const local = await table(d, t).get(rr.key);
        const tomb: Tombstone | undefined = await d.tombstones.get(`${t}:${rr.key}`);
        const theirs = rr.data.updatedAt ?? '';
        // A newer edit or deletion here wins; it goes out on the next push.
        if (local && isUnsynced(local) && (local.updatedAt ?? '') > theirs) continue;
        if (tomb && tomb.deletedAt > theirs) continue;
        if (rr.deleted) {
          if (local && !local.isSample) {
            await table(d, t).delete(rr.key);
            pulled++;
          }
          if (tomb) await d.tombstones.delete(tomb.key);
          continue;
        }
        // Already have exactly this version: don't rewrite it (that would wake every screen).
        if (local && local.updatedAt === rr.data.updatedAt && local.syncedAt === rr.data.updatedAt) continue;
        await table(d, t).put({ ...rr.data, syncedAt: rr.data.updatedAt } as Row);
        if (tomb) await d.tombstones.delete(tomb.key);
        pulled++;
      }
    });
    const newest = incoming.reduce((m, r) => (r.serverAt > m ? r.serverAt : m), cursors[t] ?? '');
    if (newest) cursors[t] = newest;
  }

  await d.syncState.put({ ...state, cursors, lastSyncedAt: new Date().toISOString() });
  return { pushed, pulled };
}

/** Links this device to a shared log. A different log than before starts its pulls from scratch. */
export async function linkBook(d: ChairLogDB, bookId: string, email: string): Promise<void> {
  const cur = await d.syncState.get('state');
  // Another account's unsent entries must never be uploaded into this person's log.
  if (cur && cur.email !== email && (await pendingCount(d)) > 0)
    throw new Error(
      `This device has changes from ${cur.email} that haven't synced. Sign in as ${cur.email} to send them, or erase this device in Settings.`,
    );
  if (cur?.bookId === bookId) {
    if (cur.email !== email) await d.syncState.put({ ...cur, email });
    return;
  }
  await d.transaction('rw', [d.syncState, ...SYNC_TABLES.map((t) => table(d, t))], async () => {
    // Everything on this device may be new to that log, so all of it goes up on the first push.
    // (Rewriting what the server already has is a no-op there.)
    for (const t of SYNC_TABLES)
      await table(d, t)
        .filter((r) => r.syncedAt !== undefined)
        .modify((r) => {
          delete r.syncedAt;
        });
    await d.syncState.put({ id: 'state', bookId, email, cursors: {}, lastSyncedAt: null });
  });
}

/** Stops syncing on this device. Its records stay; the next link pushes them again. */
export async function unlink(d: ChairLogDB): Promise<void> {
  await d.syncState.delete('state');
}
