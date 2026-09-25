"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftSelected, excludeCandidate } from "./actions";
import type { DraftOutcome } from "@/lib/dominance/letters";
import {
  AXIS_LABEL,
  INTEREST_SIGNAL_LABEL,
  SCORE_WEIGHTS,
  type InterestSignal,
  type ScoreAxis,
  type ScoreBreakdown,
} from "@/lib/dominance/types";

export type CandidateCard = {
  id: string;
  headline: string;
  hook: string | null;
  score: number;
  breakdown: ScoreBreakdown | null;
  landingUrl: string | null;
  sourceLabel: string;
  publishedDate: string | null;
};

export function CandidatePicker({ cards }: { cards: CandidateCard[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<DraftOutcome[] | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runDraft() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setOutcomes(null);
    startTransition(async () => {
      const { outcomes } = await draftSelected(ids);
      setOutcomes(outcomes);
      setSelected(new Set());
      router.refresh();
    });
  }

  function drop(id: string) {
    const reason = window.prompt("제외 사유를 한 줄로 적으십시오.");
    if (reason === null) return;
    startTransition(async () => {
      await excludeCandidate(id, reason);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {outcomes && <Outcomes outcomes={outcomes} />}

      <ul className="space-y-3">
        {cards.map((c) => (
          <li
            key={c.id}
            className={`rounded-xl border p-5 transition ${
              selected.has(c.id)
                ? "border-[color:var(--accent)] bg-surface/60"
                : "border-[color:var(--border)]/70 bg-surface/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                disabled={pending}
                className="mt-1 size-4 shrink-0 accent-[color:var(--accent)]"
                aria-label={`${c.headline} 선택`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-medium text-foreground">
                    {c.headline}
                  </h3>
                  <span className="shrink-0 text-sm font-semibold text-[color:var(--accent)]">
                    {c.score}점
                  </span>
                </div>

                {c.breakdown?.interest.paradoxLine && (
                  <p className="mt-2 text-sm text-amber-200">
                    역설 · {c.breakdown.interest.paradoxLine}
                  </p>
                )}

                {c.breakdown && <Axes breakdown={c.breakdown} />}

                <p className="mt-3 text-xs text-muted-foreground">
                  {c.sourceLabel}
                  {c.publishedDate ? ` · ${c.publishedDate} 게재` : ""}
                </p>

                <div className="mt-3 flex gap-2">
                  {c.landingUrl && (
                    <a
                      href={c.landingUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
                    >
                      원문 ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => drop(c.id)}
                    disabled={pending}
                    className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-muted-foreground hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
                  >
                    제외
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-[color:var(--border)]/70 bg-background/90 p-4 backdrop-blur">
        <span className="text-sm text-muted-foreground">
          {selected.size}개 선택됨
        </span>
        <button
          type="button"
          onClick={runDraft}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? "초안을 만들고 있습니다…" : "글 작성하기"}
        </button>
      </div>
    </div>
  );
}

function Axes({ breakdown }: { breakdown: ScoreBreakdown }) {
  const axes = Object.keys(SCORE_WEIGHTS) as ScoreAxis[];
  const signals = Object.entries(breakdown.interest.signals) as [
    InterestSignal,
    number,
  ][];

  return (
    <div className="mt-2 space-y-1">
      {signals.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {signals
            .map(([k, v]) => `${INTEREST_SIGNAL_LABEL[k]} ${v}`)
            .join(" · ")}
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        {axes.map((axis) => (
          <div key={axis} className="flex gap-2">
            <dt className="w-16 shrink-0 text-foreground/70">
              {AXIS_LABEL[axis]} {breakdown[axis].value}
            </dt>
            <dd className="min-w-0 truncate">{breakdown[axis].why}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Outcomes({ outcomes }: { outcomes: DraftOutcome[] }) {
  const ok = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--border)]/70 bg-surface/40 p-4 text-sm">
      {ok.length > 0 && (
        <p className="text-emerald-300">초안 {ok.length}편을 만들었습니다.</p>
      )}
      {failed.map((f) => (
        <p key={f.ok ? "" : f.candidateId} className="text-red-300">
          실패 · {f.ok ? "" : `${f.headline} — ${f.error}`}
        </p>
      ))}
    </div>
  );
}
