// Session refresh helper used by proxy.ts (Next.js 16 replaces middleware.ts).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: `getUser()` triggers session refresh when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate: /radar/* except /radar/login and /auth/*
  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/radar") && !path.startsWith("/radar/login");
  const isAuthCallback = path.startsWith("/auth");

  if (isProtected && !user && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/radar/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
