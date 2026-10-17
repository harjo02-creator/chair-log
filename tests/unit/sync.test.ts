import { beforeEach, describe, expect, it } from 'vitest';
import { ChairLogDB, type SyncTable } from '../../src/db/db';
import {
  deleteGoal,
  deleteMonthRecord,
  deleteVisit,
  getCatalogs,
  loadSampleData,
  saveGoal,
  saveMonthRecord,
  saveVisit,
  upsertProduct,
} from '../../src/db/repo';
import { emptyMonthRecord } from '../../src/domain/monthRecords';
import {
  linkBook,
  pendingCount,
  syncOnce,
  type Remote,
  type RemoteRow,
  type SyncData,
} from '../../src/sync/engine';
import { SEPTEMBER_VISITS } from '../fixtures/september-2026';

/** In-memory shared log with the same rules as the SQL trigger: newer updatedAt wins, no-op rewrites. */
class FakeRemote implements Remote {
  tables = new Map<SyncTable, Map<string, RemoteRow>>();
  private clock = Date.parse('2026-10-17T12:00:00Z');
  pulls = 0;

  private t(table: SyncTable) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }
  async push(table: SyncTable, rows: { key: string; data: SyncData }[]) {
    const t = this.t(table);
    for (const r of rows) {
      const old = t.get(r.key);
      if (
        old &&
        ((r.data.updatedAt ?? '') < (old.data.updatedAt ?? '') ||
          JSON.stringify(old.data) === JSON.stringify(r.data))
      )
        continue;
      this.clock += 1000;
      t.set(r.key, {
        key: r.key,
        data: structuredClone(r.data),
        serverAt: new Date(this.clock).toISOString(),
        deleted: r.data.deletedAt != null,
      });
    }
  }
  async pull(table: SyncTable, since: string | null) {
    this.pulls++;
    return [...this.t(table).values()]
      .filter((r) => since == null || r.serverAt > since)
      .sort((a, b) => a.serverAt.localeCompare(b.serverAt))
      .map((r) => structuredClone(r));
  }
  /** Moves the server clock past the pull overlap window. */
  later() {
    this.clock += 60_000;
  }
}

let n = 0;
let remote: FakeRemote;
let phone: ChairLogDB;
let laptop: ChairLogDB;
const open = async () => {
  const d = new ChairLogDB(`sync-${++n}`);
  await d.open();
  await linkBook(d, 'book-1', 'her@example.com');
  return d;
};
const tick = () => new Promise((r) => setTimeout(r, 5)); // distinct updatedAt timestamps

beforeEach(async () => {
  remote = new FakeRemote();
  phone = await open();
  laptop = await open();
});

describe('sync between two devices', () => {
  it('carries visits, monthly totals, goals and catalog edits across', async () => {
    for (const v of SEPTEMBER_VISITS.slice(0, 3)) await saveVisit(v, phone);
    await saveMonthRecord({ ...emptyMonthRecord('2026-04', ''), appointments: 35 }, phone);
    await saveGoal({ metric: 'gross', target: 2_000_000, updatedAt: '' }, phone);
    const botox = (await getCatalogs(phone)).products.find((p) => p.id === 'botox')!;
    await upsertProduct({ ...botox, defaultUnitPriceCents: 1_400 }, phone);
    expect(await pendingCount(phone)).toBe(6);

    expect(await syncOnce(phone, remote)).toMatchObject({ pushed: 6 });
    expect(await pendingCount(phone)).toBe(0);
    await syncOnce(laptop, remote);

    expect(await laptop.visits.count()).toBe(3);
    expect((await laptop.monthRecords.get('2026-04'))?.appointments).toBe(35);
    expect((await laptop.goals.get('gross'))?.target).toBe(2_000_000);
    expect((await laptop.products.get('botox'))?.defaultUnitPriceCents).toBe(1_400);
    expect(await pendingCount(laptop)).toBe(0);
  });

  it('settles: a second round moves nothing', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    expect(await syncOnce(phone, remote)).toEqual({ pushed: 0, pulled: 0 });
    expect(await syncOnce(laptop, remote)).toEqual({ pushed: 0, pulled: 0 });
  });

  it('keeps the newer edit when both devices change the same visit', async () => {
    const v = await saveVisit(SEPTEMBER_VISITS[0]!, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);

    await saveVisit({ ...v, clientId: 'PH-01' }, phone);
    await tick();
    await saveVisit({ ...v, clientId: 'LP-01' }, laptop); // later edit
    await syncOnce(laptop, remote);
    await syncOnce(phone, remote); // phone's older edit is refused, then it pulls the laptop's
    await syncOnce(laptop, remote);

    expect((await phone.visits.get(v.uid))?.clientId).toBe('LP-01');
    expect((await laptop.visits.get(v.uid))?.clientId).toBe('LP-01');
  });

  it('a local edit made after the other device’s survives the pull', async () => {
    const v = await saveVisit(SEPTEMBER_VISITS[0]!, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    await saveVisit({ ...v, clientId: 'LP-01' }, laptop);
    await syncOnce(laptop, remote);
    await tick();
    await saveVisit({ ...v, clientId: 'PH-02' }, phone); // newer, not yet pushed
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    expect((await laptop.visits.get(v.uid))?.clientId).toBe('PH-02');
  });

  it('spreads deletions', async () => {
    const v = await saveVisit(SEPTEMBER_VISITS[0]!, phone);
    await saveMonthRecord({ ...emptyMonthRecord('2026-05', ''), appointments: 10 }, phone);
    await saveGoal({ metric: 'appointments', target: 70, updatedAt: '' }, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    expect(await laptop.visits.count()).toBe(1);

    await deleteVisit(v.uid, laptop);
    await deleteMonthRecord('2026-05', laptop);
    await deleteGoal('appointments', laptop);
    await syncOnce(laptop, remote);
    expect(await laptop.tombstones.count()).toBe(0);
    await syncOnce(phone, remote);

    expect(await phone.visits.count()).toBe(0);
    expect(await phone.monthRecords.count()).toBe(0);
    expect(await phone.goals.count()).toBe(0);
  });

  it('lets a later re-save beat an earlier deletion', async () => {
    await saveMonthRecord({ ...emptyMonthRecord('2026-05', ''), appointments: 10 }, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    await deleteMonthRecord('2026-05', laptop);
    await tick();
    await saveMonthRecord({ ...emptyMonthRecord('2026-05', ''), appointments: 12 }, phone);
    await syncOnce(laptop, remote);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    expect((await laptop.monthRecords.get('2026-05'))?.appointments).toBe(12);
    expect((await phone.monthRecords.get('2026-05'))?.appointments).toBe(12);
  });

  it('never shares sample visits', async () => {
    await loadSampleData(phone);
    expect(await pendingCount(phone)).toBe(0);
    await syncOnce(phone, remote);
    expect(remote.tables.get('visits')?.size ?? 0).toBe(0);
  });

  it('pulls only what changed since last time (with a little overlap)', async () => {
    for (const v of SEPTEMBER_VISITS.slice(0, 2)) await saveVisit(v, phone);
    await syncOnce(phone, remote);
    await syncOnce(laptop, remote);
    remote.later();
    await saveVisit(SEPTEMBER_VISITS[2]!, phone);
    await syncOnce(phone, remote);
    const pulled = await syncOnce(laptop, remote);
    expect(pulled.pulled).toBe(1);
    expect(await laptop.visits.count()).toBe(3);
  });

  it('refuses to push one account’s unsent entries into another account’s log', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, phone); // unsent, belongs to her@example.com
    await expect(linkBook(phone, 'book-9', 'someone@example.com')).rejects.toThrow(/haven't synced/);
    expect((await phone.syncState.get('state'))?.email).toBe('her@example.com');
    await syncOnce(phone, remote); // once sent, another account may take over the device
    await linkBook(phone, 'book-9', 'someone@example.com');
    expect((await phone.syncState.get('state'))?.bookId).toBe('book-9');
  });

  it('re-uploads everything when linked to a different shared log', async () => {
    await saveVisit(SEPTEMBER_VISITS[0]!, phone);
    await syncOnce(phone, remote);
    expect(await pendingCount(phone)).toBe(0);
    await linkBook(phone, 'book-2', 'her@example.com');
    expect(await pendingCount(phone)).toBe(1);
    expect((await phone.syncState.get('state'))?.cursors).toEqual({});
  });
});
