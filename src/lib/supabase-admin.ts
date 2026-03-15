import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
    );
  }
  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _client;
}

/**
 * Server-only Supabase client with service role (lazy-initialized).
 * Use for: creating auth users, updating passwords, admin operations.
 * Never expose this client or use it in client components.
 * Throws only when first used if env vars are missing, so build can complete.
 */
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as unknown as Record<string, unknown>)[prop as string];
  },
});

export default supabaseAdmin;
