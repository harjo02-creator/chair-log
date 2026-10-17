/**
 * Everything that talks to Supabase: Google sign-in, finding or creating the shared log, members,
 * and the Remote the sync engine pushes and pulls through. Loaded only when sync is configured.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from '../db/db';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Remote, RemoteRow, SyncData } from './engine';

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!client)
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        // PKCE returns ?code= in the query string, which doesn't collide with the app's #/ routes.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  return client;
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = new URL(import.meta.env.BASE_URL, location.origin).href;
  const { error } = await getClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getClient().auth.signOut({ scope: 'local' });
}

/**
 * The signed-in user's email, or null. Offline, or when refreshing an expired token can't reach the
 * server, it falls back to the session saved on this device, so an offline launch never asks the
 * person to sign in again.
 */
export async function sessionEmail(): Promise<string | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const result = await Promise.race([getClient().auth.getSession(), timeout]).catch(() => null);
  const email = result?.data.session?.user.email;
  if (email) return email.toLowerCase();
  if (result && !result.error && navigator.onLine) return null; // the server says: signed out
  return savedEmail();
}

/** Email in Supabase's saved session (key `sb-<project>-auth-token`), without any network. */
function savedEmail(): string | null {
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    const saved = key
      ? (JSON.parse(localStorage.getItem(key) ?? 'null') as { user?: { email?: string } })
      : null;
    return saved?.user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function onAuthChange(fn: () => void): () => void {
  const { data } = getClient().auth.onAuthStateChange(() => fn());
  return () => data.subscription.unsubscribe();
}

/** The shared log this person belongs to; creates one (with them as its member) if there's none. */
export async function resolveBook(email: string): Promise<string> {
  const sb = getClient();
  const { data, error } = await sb
    .from('book_members')
    .select('book_id')
    .eq('email', email)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  if (data?.length) return data[0]!.book_id as string;
  const created = await sb.rpc('create_book', { book_name: 'Aurelle' });
  if (created.error) throw created.error;
  return created.data as string;
}

export async function listMembers(bookId: string): Promise<string[]> {
  const { data, error } = await getClient()
    .from('book_members')
    .select('email')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.email as string);
}

export async function addMember(bookId: string, email: string, addedBy: string): Promise<void> {
  const { error } = await getClient()
    .from('book_members')
    .insert({ book_id: bookId, email: email.trim().toLowerCase(), added_by: addedBy });
  if (error && error.code !== '23505') throw error; // 23505: already a member
}

export async function removeMember(bookId: string, email: string): Promise<void> {
  const { error } = await getClient().from('book_members').delete().eq('book_id', bookId).eq('email', email);
  if (error) throw error;
}

/** Local table → server table, key column, and catalog kind. */
const MAP: Record<SyncTable, { table: string; key: string; kind?: string }> = {
  visits: { table: 'visits', key: 'uid' },
  products: { table: 'catalog_items', key: 'id', kind: 'product' },
  areas: { table: 'catalog_items', key: 'id', kind: 'area' },
  retail: { table: 'catalog_items', key: 'id', kind: 'retail' },
  monthRecords: { table: 'month_records', key: 'month' },
  goals: { table: 'goals', key: 'metric' },
};

const PAGE = 1000;

export function supabaseRemote(bookId: string): Remote {
  const sb = getClient();
  return {
    async pull(t, since) {
      const m = MAP[t];
      const out: RemoteRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(m.table).select(`${m.key}, data, updated_at, deleted_at`).eq('book_id', bookId);
        if (m.kind) q = q.eq('kind', m.kind);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q
          .order('updated_at', { ascending: true })
          .order(m.key, { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of (data ?? []) as unknown as Record<string, unknown>[])
          out.push({
            key: String(r[m.key]),
            data: r.data as SyncData,
            serverAt: String(r.updated_at),
            deleted: r.deleted_at != null,
          });
        if (!data || data.length < PAGE) break;
      }
      return out;
    },
    async push(t, rows) {
      const m = MAP[t];
      const body = rows.map((r) => ({
        book_id: bookId,
        [m.key]: r.key,
        ...(m.kind ? { kind: m.kind } : {}),
        data: r.data,
      }));
      const onConflict = m.kind ? 'book_id,kind,id' : `book_id,${m.key}`;
      const { error } = await sb.from(m.table).upsert(body, { onConflict });
      if (error) throw error;
    },
  };
}
