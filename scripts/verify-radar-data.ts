// Verify data stored in Supabase after crawl.
// Run: npx tsx scripts/verify-radar-data.ts

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as unknown as never },
    },
  );

  // projects
  const { data: projects, count } = await supabase
    .from("projects")
    .select("id, channel, title, contract_type, budget_min, applicants_count", {
      count: "exact",
    })
    .order("first_seen_at", { ascending: false });

  console.log(`\n===== projects (${count}건) =====`);
  for (const p of projects ?? []) {
    const budget = p.budget_min
      ? `${(p.budget_min / 10000).toLocaleString()}만`
      : "-";
    console.log(
      `  [${p.contract_type ?? "-"}] ${p.title.slice(0, 50)} · ${budget} · ${p.applicants_count}명`,
    );
  }

  // relevance_scores
  const { data: scores } = await supabase
    .from("relevance_scores")
    .select("project_id, score, score_breakdown")
    .order("score", { ascending: false });

  console.log(`\n===== relevance_scores · Top score =====`);
  for (const s of (scores ?? []).slice(0, 10)) {
    const proj = projects?.find((p) => p.id === s.project_id);
    console.log(
      `  ★ ${s.score}/10 · ${proj?.title.slice(0, 45)} · ${JSON.stringify(s.score_breakdown)}`,
    );
  }

  // crawl_logs
  const { data: logs } = await supabase
    .from("crawl_logs")
    .select(
      "channel, status, projects_found, new_projects, updated_projects, started_at",
    )
    .order("started_at", { ascending: false })
    .limit(3);

  console.log(`\n===== crawl_logs (last 3) =====`);
  for (const l of logs ?? []) {
    console.log(
      `  ${l.channel} · ${l.status} · found=${l.projects_found} new=${l.new_projects} updated=${l.updated_projects} · ${l.started_at}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
