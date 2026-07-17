// Magic Link / OAuth callback · handles both PKCE (?code=) and legacy (?token_hash=)
// establishment flows. Supabase's newer clients (@supabase/ssr) default to PKCE.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // No `next` search-param support until we route it via cookie · always /radar for now.
  const next = "/radar";
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/radar/login?error=${encodeURIComponent(errorParam)}`, request.url),
    );
  }

  const supabase = await getServerAuthClient();

  // ---- PKCE flow (newer · @supabase/ssr default) ----
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/radar/login?error=${encodeURIComponent(error.message)}`,
          request.url,
        ),
      );
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  // ---- Legacy token_hash flow (older Magic Link format) ----
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery" | "invite",
      token_hash,
    });
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/radar/login?error=${encodeURIComponent(error.message)}`,
          request.url,
        ),
      );
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(
    new URL("/radar/login?error=invalid-callback", request.url),
  );
}
