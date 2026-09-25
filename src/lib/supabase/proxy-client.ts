// Session refresh helper used by proxy.ts (Next.js 16 replaces middleware.ts).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// 인증이 필요한 앱 경로. /radar/login 이 공용 로그인 화면이므로 새 앱은 여기만 추가한다.
const PROTECTED_PREFIXES = ["/radar", "/dominance"];
const LOGIN_PATH = "/radar/login";

function isProtectedPath(path: string) {
  return (
    PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !path.startsWith(LOGIN_PATH)
  );
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  // Next.js 공식 패턴 · request headers clone · x-pathname 삽입 · server component 에서 headers().get("x-pathname") 로 읽음.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Supabase env 부재 시 — landing 등 공용 라우트는 통과, 보호 경로는 login으로.
  if (!url || !anon) {
    if (isProtectedPath(path)) {
      const to = request.nextUrl.clone();
      to.pathname = LOGIN_PATH;
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
          // Response 재생성 시 · requestHeaders (x-pathname 포함) 유지
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
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

  // Gate: PROTECTED_PREFIXES except the login page and /auth/*
  const isAuthCallback = path.startsWith("/auth");

  if (isProtectedPath(path) && !user && !isAuthCallback) {
    const to = request.nextUrl.clone();
    to.pathname = LOGIN_PATH;
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  return supabaseResponse;
}
