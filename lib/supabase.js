import { createClient } from "@supabase/supabase-js";

let _client = null;

/**
 * Singleton Supabase client. The service-role key is required server-side
 * (Vercel Functions only). Never import this from client-side code.
 */
export function supabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
