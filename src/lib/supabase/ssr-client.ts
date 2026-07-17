// Server-side Supabase client using the user's auth cookie.
// Use in Server Components / Server Actions / Route Handlers when you need
// to run under the authenticated user's identity (RLS applies).

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getServerAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // The `setAll` may be called from a Server Component that cannot
            // set cookies. Ignore — the proxy handles session refresh.
          }
        },
      },
    },
  );
}
