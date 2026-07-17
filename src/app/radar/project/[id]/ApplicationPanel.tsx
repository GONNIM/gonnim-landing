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
        <h2 className="text-sm font-medium text-neutral-300">지원 초안</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              제안서 초안
            </span>
            <textarea
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Claude API 통합 예정 · 지금은 수동 편집"
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
              메모
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
