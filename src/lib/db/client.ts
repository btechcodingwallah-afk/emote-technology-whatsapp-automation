import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Returns a Supabase client using the SERVICE_ROLE key.
 * This client bypasses RLS and should only be used server-side.
 * NEVER expose this client to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables (URL or SERVICE_ROLE_KEY)');
  }

  _supabaseAdmin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _supabaseAdmin;
}

/**
 * Returns a Supabase client using the ANON key.
 * Used for client-side operations (subject to RLS).
 */
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables (URL or ANON_KEY)');
  }

  return createClient(url, key);
}
