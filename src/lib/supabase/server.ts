// Server-side Supabase client using Service Role Key.
// ONLY use in Route Handlers / Server Components — never expose to browser.

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Node 20 lacks native WebSocket · Realtime client needs explicit ws transport.
    // Node 22+ ships native WebSocket · this line is a no-op there.
    realtime: {
      transport: WebSocket as unknown as never,
    },
  });
}
