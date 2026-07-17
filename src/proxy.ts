// Next.js 16 · proxy.ts (replaces middleware.ts).
// Runs before rendering to refresh Supabase session and gate /radar/*.

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-client";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Match everything except static assets, favicon, and OpenGraph image.
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|robots.txt|sitemap.xml|resume.pdf|resume-gigs.pdf).*)",
  ],
};
