// Sign out endpoint · POST from layout.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";

export async function POST(request: NextRequest) {
  const supabase = await getServerAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/radar/login", request.url), {
    status: 303,
  });
}
