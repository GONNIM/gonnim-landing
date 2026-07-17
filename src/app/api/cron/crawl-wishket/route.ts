// Vercel Cron trigger · daily Wishket crawl → Supabase upsert.
// Schedule (vercel.json): "0 23 * * *" UTC = 08:00 KST.
// Auth: Vercel Cron requires Authorization: Bearer <CRON_SECRET> header.

import type { NextRequest } from "next/server";

import { WishketCrawler } from "@/lib/crawlers/wishket";
import { calculateRelevance } from "@/lib/relevance";
import { getServiceRoleClient } from "@/lib/supabase/server";
import type { ProjectInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds · Vercel Hobby ceiling

export async function GET(req: NextRequest) {
  // 1) Cron auth (Vercel Cron sends this header automatically)
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  const crawler = new WishketCrawler();
  const startedAt = new Date().toISOString();
  const result = await crawler.crawl();

  let newProjects = 0;
  let updatedProjects = 0;

  // 2) Upsert projects · unique (channel, external_id)
  for (const raw of result.projects) {
    const insert: ProjectInsert = {
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
      status: "active",
      last_seen_at: startedAt,
    };

    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("channel", crawler.channel)
      .eq("external_id", raw.external_id)
      .maybeSingle();

    if (existing?.id) {
      // update
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
          location: insert.location,
          applicants_count: insert.applicants_count,
          deadline_at: insert.deadline_at,
          raw_data: insert.raw_data,
          last_seen_at: startedAt,
          status: "active",
        })
        .eq("id", existing.id);
      if (!error) updatedProjects += 1;
    } else {
      // insert (with first_seen_at default NOW())
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert(insert)
        .select("id")
        .single();

      if (!error && inserted?.id) {
        newProjects += 1;

        // 3) Score relevance for new project · rule-based
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

  // 4) Log the run
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

  return Response.json({
    channel: crawler.channel,
    fetchedAt: result.fetchedAt,
    projectsFound: result.projects.length,
    newProjects,
    updatedProjects,
    errors: result.errors,
    status,
  });
}
