import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when env vars are missing; the app then runs offline-only. */
export const syncAvailable = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!url || !anonKey) throw new Error('Supabase is not configured (missing VITE_SUPABASE_* env vars)');
  client ??= createClient(url, anonKey);
  return client;
}

/** Players need an auth uid to join; anonymous sign-in gives one without an account. */
export async function ensureAnonymousUser(): Promise<void> {
  const supabase = getClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}
