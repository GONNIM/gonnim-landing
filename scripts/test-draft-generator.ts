// Local test · pick top-relevance active project and generate a real draft.
// Run: npx tsx scripts/test-draft-generator.ts

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { generateDraft, type ProjectContext } from "../src/lib/draft-generator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }
  if (!process.env.ZAI_API_KEY) {
    console.error("Missing ZAI_API_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  const { data: rows, error } = await supabase
    .from("projects")
    .select(
      `id, channel, external_url, title, description, category, skills,
       budget_min, budget_max, duration_days, work_type, contract_type, location,
       relevance_scores(score)`,
    )
    .eq("status", "active");

  if (error || !rows?.length) {
    console.error("failed to load projects:", error?.message);
    process.exit(1);
  }

  type RowShape = {
    id: string;
    channel: string;
    external_url: string;
    title: string;
    description: string | null;
    category: string | null;
    skills: string[] | null;
    budget_min: number | null;
    budget_max: number | null;
    duration_days: number | null;
    work_type: string | null;
    contract_type: string | null;
    location: string | null;
    relevance_scores: { score: number }[] | null;
  };

  const sorted = (rows as RowShape[])
    .map((r) => ({ ...r, score: r.relevance_scores?.[0]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const top = sorted[0];

  console.log(`\n===== picked project (top score) =====`);
  console.log(`  [${top.channel}] ${top.title}`);
  console.log(`  score: ${top.score}/10 · budget: ${top.budget_min ?? "-"} · duration: ${top.duration_days ?? "-"}일`);

  const ctx: ProjectContext = {
    channel: top.channel,
    title: top.title,
    description: top.description,
    category: top.category,
    skills: top.skills,
    budget_min: top.budget_min,
    budget_max: top.budget_max,
    duration_days: top.duration_days,
    work_type: top.work_type,
    contract_type: top.contract_type,
    location: top.location,
    external_url: top.external_url,
  };

  const t0 = Date.now();
  console.log(`\n===== calling z.ai GLM-5.2 =====`);
  const draft = await generateDraft(ctx);
  const dt = Date.now() - t0;

  console.log(`\n===== response (in ${(dt / 1000).toFixed(1)}s) =====`);
  console.log(`suggested_budget: ${draft.suggestedBudget ?? "-"}`);
  console.log(`suggested_duration_days: ${draft.suggestedDurationDays ?? "-"}`);
  console.log(`proposal length: ${draft.proposal.length} chars\n`);
  console.log(`----- PROPOSAL -----`);
  console.log(draft.proposal);
  console.log(`----- END -----\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
