import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component where cookies
            // cannot be set. This can be safely ignored when the
            // middleware refreshes the session.
          }
        },
      },
    }
  );
}

/**
 * Admin client using the service role key. Bypasses RLS — use only for trusted
 * server-side operations.
 *
 * Deliberately NOT built with `createServerClient` + cookies: `@supabase/ssr`
 * prefers the cookie session's access token over the key it was constructed
 * with, so with a logged-in user present the requests would carry that user's
 * JWT and RLS would still apply — an "admin" client that silently isn't one.
 * A bare client with no session attached always authenticates as the service
 * role, which is what the webhook receivers already do.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
