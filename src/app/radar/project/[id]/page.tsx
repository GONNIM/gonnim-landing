// /radar/project/[id] · project detail + Application panel.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import {
  CHANNEL_LABEL,
  CONTRACT_LABEL,
  WORK_TYPE_LABEL,
  formatKRW,
  formatDate,
  scoreTone,
} from "@/lib/radar-format";
import { ApplicationPanel } from "./ApplicationPanel";
import type { ApplicationStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type ProjectDetail = {
  id: string;
  channel: string;
  external_id: string;
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
  applicants_count: number | null;
  posted_at: string | null;
  deadline_at: string | null;
  raw_data: unknown;
  first_seen_at: string;
  last_seen_at: string;
  relevance_scores: { score: number; score_breakdown: unknown }[] | null;
  applications:
    | {
        id: string;
        status: ApplicationStatus;
        draft_proposal: string | null;
        draft_budget: number | null;
        draft_duration_days: number | null;
        notes: string | null;
        insight_report: string | null;
        competition_level: string | null;
        business_grade: string | null;
        insight_generated_at: string | null;
        sprint_status: string | null;
        sprint_decided_at: string | null;
      }[]
    | null;
};

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getServerAuthClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      `id, channel, external_id, external_url, title, description, category,
       skills, budget_min, budget_max, duration_days, work_type, contract_type,
       location, applicants_count, posted_at, deadline_at, raw_data,
       first_seen_at, last_seen_at,
       relevance_scores(score, score_breakdown),
       applications(id, status, draft_proposal, draft_budget,
                    draft_duration_days, notes, insight_report,
                    competition_level, business_grade, insight_generated_at,
                    sprint_status, sprint_decided_at)`,
    )
    .eq("id", id)
    .maybeSingle<ProjectDetail>();

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-lg font-semibold text-red-300">DB 오류</h1>
        <p className="text-sm text-neutral-400">{error.message}</p>
      </div>
    );
  }
  if (!project) notFound();

  const score = project.relevance_scores?.[0]?.score ?? 0;
  const breakdown = project.relevance_scores?.[0]?.score_breakdown as
    | Record<string, number>
    | undefined;
  const application = project.applications?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/radar/projects"
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← 프로젝트 리스트
        </Link>
      </div>

      <header className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${scoreTone(score)}`}
          >
            ★ {score}/10
          </span>
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            {CHANNEL_LABEL[project.channel] ?? project.channel}
          </span>
          {project.contract_type && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                project.contract_type === "outsourcing"
                  ? "bg-emerald-950 text-emerald-300"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {CONTRACT_LABEL[project.contract_type] ?? project.contract_type}
            </span>
          )}
          {project.work_type && (
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
              {WORK_TYPE_LABEL[project.work_type] ?? project.work_type}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-neutral-100">
          {project.title}
        </h1>
        <p className="text-sm text-neutral-400">
          {project.category ?? "카테고리 -"} · 예산 {formatKRW(project.budget_min)}
          {project.budget_max && project.budget_max !== project.budget_min
            ? ` ~ ${formatKRW(project.budget_max)}`
            : ""}{" "}
          · 기간 {project.duration_days ?? "-"}일 · 지원자{" "}
          {project.applicants_count ?? 0}명 · {project.location ?? "-"}
        </p>
        <p className="text-xs text-neutral-500">
          첫 수집 {formatDate(project.first_seen_at)} · 마지막 감지{" "}
          {formatDate(project.last_seen_at)} · 마감 {formatDate(project.deadline_at)}
        </p>
        <div className="pt-2">
          <a
            href={project.external_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            원 프로젝트 페이지 ↗
          </a>
        </div>
      </header>

      {breakdown && (
        <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="text-sm font-medium text-neutral-300">정합도 근거</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(breakdown).map(([k, v]) => (
              <span
                key={k}
                className={`rounded border border-neutral-800 px-2 py-1 ${
                  v > 0
                    ? "text-emerald-300"
                    : v < 0
                      ? "text-red-300"
                      : "text-neutral-400"
                }`}
              >
                {k} {v > 0 ? `+${v}` : v}
              </span>
            ))}
          </div>
        </section>
      )}

      {project.skills && project.skills.length > 0 && (
        <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="text-sm font-medium text-neutral-300">기술 스택</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {project.skills.map((s) => (
              <span
                key={s}
                className="rounded border border-neutral-800 px-2 py-1 text-neutral-300"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {project.description && (
        <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="text-sm font-medium text-neutral-300">설명</h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-300">
            {project.description}
          </p>
        </section>
      )}

      <ApplicationPanel
        projectId={project.id}
        application={{
          id: application?.id ?? null,
          status: application?.status ?? null,
          draft_proposal: application?.draft_proposal ?? null,
          draft_budget: application?.draft_budget ?? null,
          draft_duration_days: application?.draft_duration_days ?? null,
          notes: application?.notes ?? null,
          insight_report: application?.insight_report ?? null,
          competition_level: application?.competition_level ?? null,
          business_grade: application?.business_grade ?? null,
          insight_generated_at: application?.insight_generated_at ?? null,
          sprint_status: application?.sprint_status ?? null,
          sprint_decided_at: application?.sprint_decided_at ?? null,
        }}
      />
    </div>
  );
}
