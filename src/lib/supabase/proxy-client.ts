// Session refresh helper used by proxy.ts (Next.js 16 replaces middleware.ts).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  // Supabase env 부재 시 — landing 등 공용 라우트는 통과, /radar 는 login으로.
  if (!url || !anon) {
    const isRadar =
      path.startsWith("/radar") && !path.startsWith("/radar/login");
    if (isRadar) {
      const to = request.nextUrl.clone();
      to.pathname = "/radar/login";
      to.searchParams.set("error", "supabase-not-configured");
      return NextResponse.redirect(to);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    url,
    anon,
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

  // IMPORTANT: `getUser()` triggers session refresh when needed. Guard against
  // network/auth errors so the landing page never 500s from proxy failures.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // Gate: /radar/* except /radar/login and /auth/*
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
