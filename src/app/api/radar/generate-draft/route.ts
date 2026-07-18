// Server-side proposal draft generation for a Radar project.
// POST body: { projectId: string }
// Requires authenticated user (RLS) · uses Claude with prompt caching.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { generateDraft, type ProjectContext } from "@/lib/draft-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ProjectRow = {
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
};

export async function POST(req: NextRequest) {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const projectId = body.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      `channel, external_url, title, description, category, skills,
       budget_min, budget_max, duration_days, work_type, contract_type, location`,
    )
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const ctx: ProjectContext = {
    channel: project.channel,
    title: project.title,
    description: project.description,
    category: project.category,
    skills: project.skills,
    budget_min: project.budget_min,
    budget_max: project.budget_max,
    duration_days: project.duration_days,
    work_type: project.work_type,
    contract_type: project.contract_type,
    location: project.location,
    external_url: project.external_url,
  };

  try {
    const draft = await generateDraft(ctx);
    return NextResponse.json({
      proposal: draft.proposal,
      suggestedBudget: draft.suggestedBudget,
      suggestedDurationDays: draft.suggestedDurationDays,
    });
  } catch (err) {
    const status =
      typeof err === "object" && err && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status });
  }
}
