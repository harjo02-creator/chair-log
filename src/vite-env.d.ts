/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co. Unset = local-only build. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. Safe to ship: row-level security decides what it can read. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
