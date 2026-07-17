// Node-runtime Wanted Gigs crawler → Supabase.
// Run locally: npx tsx scripts/crawl-wanted-gigs.ts
// Cron target once we deploy to a Docker host (Railway/Fly/etc.).

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { WantedGigsCrawler } from "../src/lib/crawlers/wanted-gigs";
import { calculateRelevance } from "../src/lib/relevance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  const startedAt = new Date().toISOString();
  const crawler = new WantedGigsCrawler();
  const result = await crawler.crawl();

  let newProjects = 0;
  let updatedProjects = 0;

  for (const raw of result.projects) {
    const insert = {
      channel: crawler.channel,
      external_id: raw.external_id,
      external_url: raw.external_url,
      title: raw.title,
      description: raw.description ?? null,
      category: raw.category ?? null,
      skills: raw.skills ?? null,
      budget_min: raw.budget_min ?? null,
      budget_max: raw.budget_max ?? null,
      budget_currency: raw.budget_currency ?? "KRW",
      duration_days: raw.duration_days ?? null,
      work_type: raw.work_type ?? null,
      contract_type: raw.contract_type ?? null,
      location: raw.location ?? null,
      applicants_count: raw.applicants_count ?? 0,
      posted_at: raw.posted_at ?? null,
      deadline_at: raw.deadline_at ?? null,
      raw_data: raw.raw_data ?? null,
      status: "active" as const,
      last_seen_at: startedAt,
    };

    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("channel", crawler.channel)
      .eq("external_id", raw.external_id)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("projects")
        .update({
          title: insert.title,
          description: insert.description,
          category: insert.category,
          skills: insert.skills,
          budget_min: insert.budget_min,
          budget_max: insert.budget_max,
          duration_days: insert.duration_days,
          contract_type: insert.contract_type,
          work_type: insert.work_type,
          applicants_count: insert.applicants_count,
          raw_data: insert.raw_data,
          last_seen_at: startedAt,
          status: "active",
        })
        .eq("id", existing.id);
      if (!error) updatedProjects += 1;
    } else {
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert(insert)
        .select("id")
        .single();
      if (!error && inserted?.id) {
        newProjects += 1;

        const { score, breakdown } = calculateRelevance({
          title: insert.title,
          description: insert.description,
          category: insert.category,
          skills: insert.skills,
          budget_min: insert.budget_min,
          duration_days: insert.duration_days,
          work_type: insert.work_type,
          contract_type: insert.contract_type,
          applicants_count: insert.applicants_count,
        });

        await supabase.from("relevance_scores").insert({
          project_id: inserted.id,
          score,
          score_breakdown: breakdown,
          strategy: "rule-based",
        });
      }
    }
  }

  const endedAt = new Date().toISOString();
  const status =
    result.errors.length === 0
      ? "success"
      : result.projects.length > 0
        ? "partial"
        : "failed";

  await supabase.from("crawl_logs").insert({
    channel: crawler.channel,
    started_at: startedAt,
    ended_at: endedAt,
    projects_found: result.projects.length,
    new_projects: newProjects,
    updated_projects: updatedProjects,
    status,
    error_message: result.errors.join(" | ") || null,
    metadata: { fetchedAt: result.fetchedAt },
  });

  console.log(
    `wanted-gigs · ${status} · found=${result.projects.length} new=${newProjects} updated=${updatedProjects}`,
  );
  if (result.errors.length) console.log("errors:", result.errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
