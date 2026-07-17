// Verify Supabase connection using values from .env.local
// Run: npx tsx scripts/test-supabase-connection.ts

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`\n===== Env Check =====`);
  console.log(`URL:         ${url ? "✓ set" : "✗ missing"}`);
  console.log(`ANON_KEY:    ${anonKey ? `✓ set (${anonKey.length} chars)` : "✗ missing"}`);
  console.log(`SERVICE_KEY: ${serviceKey ? `✓ set (${serviceKey.length} chars)` : "✗ missing"}`);

  if (!url || !serviceKey) {
    console.log("\n✗ Missing env · abort");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: {
      transport: WebSocket as unknown as never,
    },
  });

  console.log(`\n===== Supabase Connection =====`);

  // 1) Read table
  const { data: projects, error: readErr, count } = await supabase
    .from("projects")
    .select("id, title", { count: "exact" })
    .limit(3);

  if (readErr) {
    console.log(`✗ Read failed: ${readErr.message}`);
    console.log(`  Code: ${readErr.code} · Details: ${readErr.details}`);
    process.exit(1);
  }
  console.log(`✓ Read projects: ${count} rows total · sample:`);
  for (const p of projects ?? []) console.log(`  - ${p.id.slice(0, 8)} ${p.title.slice(0, 40)}`);

  // 2) Test INSERT to crawl_logs
  const { error: insertErr } = await supabase.from("crawl_logs").insert({
    channel: "wishket",
    started_at: new Date().toISOString(),
    status: "success",
    projects_found: 0,
    metadata: { test: true },
  });
  if (insertErr) {
    console.log(`✗ Insert failed: ${insertErr.message}`);
    console.log(`  Code: ${insertErr.code} · Details: ${insertErr.details}`);
    process.exit(1);
  }
  console.log(`✓ Insert crawl_logs: success`);

  console.log(`\n===== All checks passed =====\n`);
}

main().catch((err) => {
  console.error("✗ Uncaught:", err);
  process.exit(1);
});
