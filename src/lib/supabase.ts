// Supabase client — single instance, typed against the generated schema.
// See PLAN.md "Environment" + "Client architecture". The client is the durable
// backend; the app must keep working in local-demo mode when these env vars
// are absent (e.g. a bare checkout with no .env), so we don't throw — we just
// leave `supabase` null and let callers (src/lib/db.ts, src/lib/sync.ts) fall
// back to local-only behavior.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function makeClient(): SupabaseClient<Database> | null {
  if (!url || !anonKey) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — ' +
        'auth and cloud sync are disabled; the app runs in local-demo mode.'
      );
    }
    return null;
  }
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/** Null when VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't configured. */
export const supabase = makeClient();

/** True when the app can talk to Supabase at all (env vars present). */
export const isSupabaseConfigured = supabase !== null;

/** Throws a friendly error for call sites that require a live client (src/lib/db.ts). */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  return supabase;
}
