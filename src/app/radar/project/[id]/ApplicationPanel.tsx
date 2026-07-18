"use client";

// Client controls for an Application row: status transitions + draft form.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_ORDER,
} from "@/lib/radar-format";
import {
  ensureApplication,
  saveDraftAndNotes,
  updateApplicationStatus,
} from "./actions";
import type { ApplicationStatus } from "@/lib/supabase/types";

export function ApplicationPanel({
  projectId,
  application,
}: {
  projectId: string;
  application: {
    id: string | null;
    status: ApplicationStatus | null;
    draft_proposal: string | null;
    draft_budget: number | null;
    draft_duration_days: number | null;
    notes: string | null;
    insight_report: string | null;
    competition_level: string | null;
    business_grade: string | null;
    insight_generated_at: string | null;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<ApplicationStatus>(
    application.status ?? "interested",
  );
  const [draft, setDraft] = useState(application.draft_proposal ?? "");
  const [budget, setBudget] = useState<string>(
    application.draft_budget != null ? String(application.draft_budget) : "",
  );
  const [duration, setDuration] = useState<string>(
    application.draft_duration_days != null
      ? String(application.draft_duration_days)
      : "",
  );
  const [notes, setNotes] = useState(application.notes ?? "");

  const [applicationId, setApplicationId] = useState<string | null>(
    application.id,
  );

  const [insightReport, setInsightReport] = useState<string | null>(
    application.insight_report,
  );
  const [competitionLevel, setCompetitionLevel] = useState<string | null>(
    application.competition_level,
  );
  const [businessGrade, setBusinessGrade] = useState<string | null>(
    application.business_grade,
  );
  const [insightGeneratedAt, setInsightGeneratedAt] = useState<string | null>(
    application.insight_generated_at,
  );
  const [insightGenerating, setInsightGenerating] = useState(false);

  function run(fn: () => Promise<void>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setMessage("저장됨");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function ensureId(): Promise<string> {
    if (applicationId) return applicationId;
    const newId = await ensureApplication(projectId);
    setApplicationId(newId);
    return newId;
  }

  async function onChangeStatus(nextStatus: ApplicationStatus) {
    setStatus(nextStatus);
    const id = await ensureId();
    await updateApplicationStatus(id, projectId, nextStatus);
  }

  async function onSaveDraft() {
    const id = await ensureId();
    await saveDraftAndNotes(id, projectId, {
      draftProposal: draft,
      draftBudget: budget ? Number(budget) : null,
      draftDurationDays: duration ? Number(duration) : null,
      notes,
    });
  }

  const [generating, setGenerating] = useState(false);

  async function onGenerateInsight() {
    setError(null);
    setMessage(null);
    setInsightGenerating(true);
    try {
      const res = await fetch("/api/radar/generate-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userNote: notes }),
      });
      const data = (await res.json()) as {
        report?: string;
        competitionLevel?: string | null;
        businessGrade?: string | null;
        verdict?: string;
        generatedAt?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "사업화 분석 생성 실패");
      if (data.report) setInsightReport(data.report);
      setCompetitionLevel(data.competitionLevel ?? null);
      setBusinessGrade(data.businessGrade ?? null);
      setInsightGeneratedAt(data.generatedAt ?? new Date().toISOString());
      setMessage(
        `사업화 분석 완료${data.verdict ? " · " + data.verdict : ""}`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInsightGenerating(false);
    }
  }

  async function onGenerateDraft() {
    setError(null);
    setMessage(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/radar/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userNote: notes }),
      });
      const data = (await res.json()) as {
        proposal?: string;
        suggestedBudget?: number | null;
        suggestedDurationDays?: number | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "초안 생성 실패");
      if (data.proposal) setDraft(data.proposal);
      if (data.suggestedBudget != null) setBudget(String(data.suggestedBudget));
      if (data.suggestedDurationDays != null)
        setDuration(String(data.suggestedDurationDays));
      setMessage("AI 초안 반영됨 · 검토 후 저장하세요");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
      <div>
        <h2 className="text-sm font-medium text-neutral-300">Funnel 상태</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {APPLICATION_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => run(() => onChangeStatus(s))}
              className={`rounded px-3 py-1.5 text-xs ${
                status === s
                  ? "bg-neutral-100 text-neutral-900"
                  : "border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
              }`}
            >
              {APPLICATION_STATUS[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              🔍 사업화 타당성 리포트
            </h2>
            {insightGeneratedAt && (
              <p className="mt-1 text-[10px] text-neutral-500">
                마지막 생성 · {new Date(insightGeneratedAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={insightGenerating || generating || isPending}
            onClick={onGenerateInsight}
            className="rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 hover:border-sky-500 hover:text-sky-100 disabled:opacity-60"
          >
            {insightGenerating
              ? "AI 분석 중…"
              : insightReport
                ? "🔄 재분석"
                : "🔍 사업화 분석 실행"}
          </button>
        </div>
        {(competitionLevel || businessGrade) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {competitionLevel && (
              <span
                className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${
                  competitionLevel === "red"
                    ? "bg-red-950 text-red-300"
                    : competitionLevel === "yellow"
                      ? "bg-amber-950 text-amber-300"
                      : "bg-sky-950 text-sky-300"
                }`}
              >
                {competitionLevel === "red"
                  ? "🔴 Red · 포화"
                  : competitionLevel === "yellow"
                    ? "🟡 Yellow · 각도 존재"
                    : "🔵 Blue · 미개척"}
              </span>
            )}
            {businessGrade && (
              <span
                className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${
                  businessGrade === "A"
                    ? "bg-emerald-950 text-emerald-300"
                    : businessGrade === "B"
                      ? "bg-sky-950 text-sky-300"
                      : businessGrade === "C"
                        ? "bg-amber-950 text-amber-300"
                        : "bg-neutral-800 text-neutral-400"
                }`}
              >
                사업화 등급 {businessGrade}
                {businessGrade === "A"
                  ? " · 강추"
                  : businessGrade === "B"
                    ? " · 조건부"
                    : businessGrade === "C"
                      ? " · 재검토"
                      : " · 제외"}
              </span>
            )}
            <span className="text-[11px] text-neutral-500">
              마켓 검증 · 유사 솔루션 · 차별화 각도 종합 판정
            </span>
          </div>
        )}
        {insightReport ? (
          <pre className="mt-3 max-h-[600px] overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-100">
            {insightReport}
          </pre>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-neutral-800 bg-neutral-950/40 p-4 text-xs text-neutral-500">
            🔍 위 버튼을 누르면 이 프로젝트를 사업 아이템 후보로 정밀 분석합니다.
            프로젝트 인사이트 → 마켓 검증 · 레드오션 여부 → 사업화 모델 3가지 →
            파일럿 실행 계획까지 7섹션 리포트. 사전 판단·전략 노트가 있으면 자동
            반영됩니다.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-300">지원 초안</h2>
          <button
            type="button"
            disabled={generating || isPending}
            onClick={onGenerateDraft}
            className="rounded-md border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:border-emerald-500 hover:text-emerald-100 disabled:opacity-60"
          >
            {generating ? "AI 생성 중…" : "🪄 AI 초안 생성"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              제안서 초안
            </span>
            <textarea
              rows={12}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="🪄 위의 AI 초안 생성 버튼을 누르면 사용자 자산을 인용한 맞춤형 제안서 초안이 채워집니다. 필요 시 자유 편집 후 저장."
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              견적 (원)
            </span>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              기간 (일)
            </span>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              메모 · 사전 판단·전략 노트
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="이 프로젝트만의 어필 포인트·차별화 각도·주의 사항을 남기세요 (예: '개인정보 강조 · AI 홍변 v3 매칭'). AI 초안 생성 시 자동 반영됩니다."
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(onSaveDraft)}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          {message && <span className="text-xs text-emerald-400">{message}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>
    </section>
  );
}
