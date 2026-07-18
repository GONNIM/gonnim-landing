// Sprint 정밀 분석 리포트 생성 API
// POST body: { projectId: string, userNote?: string | null }
// 인증 필수 (RLS) · 결과를 applications 테이블에 저장 후 응답.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { generateInsight } from "@/lib/insight-generator";
import type { ProjectContext } from "@/lib/draft-generator";

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

  let body: { projectId?: string; userNote?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const projectId = body.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  }
  const clientNote =
    typeof body.userNote === "string" ? body.userNote.trim() : null;

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

  // 노트 폴백: 클라이언트 미제공 시 DB 조회 (RLS 로 user 스코프)
  let userNote: string | null = clientNote;
  if (!userNote) {
    const { data: appRow } = await supabase
      .from("applications")
      .select("notes")
      .eq("project_id", projectId)
      .maybeSingle<{ notes: string | null }>();
    userNote = (appRow?.notes ?? "").trim() || null;
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
    userNote,
  };

  try {
    const insight = await generateInsight(ctx);

    // applications 레코드 upsert · 최소 필드만 (status 는 기존 유지)
    const nowIso = new Date().toISOString();
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle<{ id: string }>();

    if (existing?.id) {
      await supabase
        .from("applications")
        .update({
          insight_report: insight.report,
          go_decision: insight.goDecision,
          insight_generated_at: nowIso,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("applications").insert({
        project_id: projectId,
        status: "interested",
        insight_report: insight.report,
        go_decision: insight.goDecision,
        insight_generated_at: nowIso,
      });
    }

    return NextResponse.json({
      report: insight.report,
      goDecision: insight.goDecision,
      goReason: insight.goReason,
      generatedAt: nowIso,
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
