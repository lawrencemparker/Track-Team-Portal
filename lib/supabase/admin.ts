import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * IMPORTANT:
 * - Only use in Route Handlers / server-only contexts.
 * - Requires SUPABASE_SERVICE_ROLE_KEY in env.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
