/**
 * Runs sync in the background: on launch, when the device comes back online or the app comes back
 * to the foreground, shortly after local edits, and every minute while the app is visible.
 * The UI reads progress through useSyncStatus().
 */
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { eraseAllData, updateSettings } from '../db/repo';
import { syncConfigured } from './config';
import { linkBook, pendingCount, syncOnce } from './engine';

export type SyncPhase = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  email: string | null;
  bookId: string | null;
  lastSyncedAt: string | null;
  pending: number;
  message: string | null;
  /** False until the saved session has been read (from this device, so it works offline). */
  authChecked: boolean;
}

let status: SyncStatus = {
  phase: syncConfigured ? 'signed-out' : 'off',
  authChecked: !syncConfigured,
  email: null,
  bookId: null,
  lastSyncedAt: null,
  pending: 0,
  message: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

export function syncLabel(s: SyncStatus): string {
  switch (s.phase) {
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return s.pending ? `${s.pending} waiting to sync` : 'Synced';
    case 'offline':
      return s.pending ? `Offline · ${s.pending} waiting` : 'Offline';
    case 'error':
      return 'Sync failed';
    default:
      return '';
  }
}

const sb = () => import('./supabase');

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Pushes and pulls now. Overlapping calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** After a local edit: sync a moment later, so a burst of edits goes up together. */
export function requestSync(delayMs = 2000) {
  if (status.phase === 'off' || status.phase === 'signed-out') return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

async function runOnce() {
  if (!syncConfigured) return;
  const { sessionEmail, resolveBook, supabaseRemote } = await sb();
  const email = await sessionEmail();
  if (!email) {
    set({ phase: 'signed-out', email: null, bookId: null, pending: 0, authChecked: true });
    return;
  }
  set({ email, pending: await pendingCount(db), authChecked: true });
  if (!navigator.onLine) {
    set({ phase: 'offline' });
    return;
  }
  set({ phase: 'syncing', message: null });
  try {
    let state = await db.syncState.get('state');
    if (!state || state.email !== email) {
      await linkBook(db, await resolveBook(email), email);
      state = await db.syncState.get('state');
    }
    await syncOnce(db, supabaseRemote(state!.bookId));
    await skipWelcomeIfLogHasData();
    const after = await db.syncState.get('state');
    set({
      phase: 'synced',
      bookId: state!.bookId,
      lastSyncedAt: after?.lastSyncedAt ?? null,
      pending: await pendingCount(db),
    });
  } catch (e) {
    const offline = !navigator.onLine;
    set({
      phase: offline ? 'offline' : 'error',
      message: offline ? null : e instanceof Error ? e.message : String(e),
      pending: await pendingCount(db),
    });
  }
}

/** A device joining a log that already has entries doesn't need the first-run welcome. */
async function skipWelcomeIfLogHasData() {
  const settings = await db.settings.get('settings');
  if (settings?.onboardingDone) return;
  const has = (await db.visits.filter((v) => !v.isSample).count()) + (await db.monthRecords.count());
  if (has) await updateSettings({ onboardingDone: true });
}

let started = false;

/** Called once at app start. Does nothing when this build has no Supabase project. */
export function startSync() {
  if (started || !syncConfigured) return;
  started = true;
  void (async () => {
    const { onAuthChange } = await sb();
    onAuthChange(() => void syncNow());
    await syncNow();
    // Back from Google: drop the one-time ?code= from the address bar.
    if (new URLSearchParams(location.search).has('code'))
      history.replaceState(null, '', location.pathname + location.hash);
  })();
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => set({ phase: status.email ? 'offline' : status.phase }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && status.email) void syncNow();
  }, 60_000);
}

export async function signIn() {
  const { signInWithGoogle } = await sb();
  await signInWithGoogle(); // leaves the page for Google, then returns with ?code=
}

export type SignOutResult = { ok: true } | { ok: false; pending: number; offline: boolean };

/**
 * Signs out and removes this device's copy, so the next person to sign in here never sees, or
 * uploads, someone else's log. Unsent changes are sent first; if they can't be, it stops and
 * reports how many (unless `discard` is set).
 */
export async function signOut(discard = false): Promise<SignOutResult> {
  if (!discard) {
    await syncNow();
    const pending = await pendingCount(db);
    if (pending) return { ok: false, pending, offline: !navigator.onLine };
  }
  const { signOut: out } = await sb();
  await out();
  await eraseAllData(db);
  set({ phase: 'signed-out', email: null, bookId: null, pending: 0, lastSyncedAt: null, message: null });
  return { ok: true };
}
