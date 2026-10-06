"use client";

// 48차 A · D51 · ④ 리뷰 화면에서 제목 · 한 문장 요약만 고친다. 상태(리뷰 대기 · 리뷰 통과)는 그대로다.
// 저장할 때 서버가 거절 필터와 범주 이름 검사를 두 칸에 돌린다. 걸리면 저장하지 않고 이유를 보인다.

import { useState } from "react";
import { ActionButton, type RunResult } from "../../_ui/ActionButton";
import { useRouter } from "next/navigation";
import { saveTitleSummary } from "../../title-actions";
import { TitleSuggestBox } from "../../TitleSuggestBox";
import type { TitleSuggestions } from "@/lib/dominance/title-suggest";

export function TitleSummaryEditor({
  letterId,
  initialTitle,
  initialSummary,
  suggestReady,
  suggestions,
}: {
  letterId: string;
  initialTitle: string;
  initialSummary: string;
  suggestReady: boolean;
  suggestions: TitleSuggestions | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const changed = title.trim() !== initialTitle.trim() || summary.trim() !== initialSummary.trim();

  // 56차 C · 결과 글자를 알림 띠로 낸다(ActionButton)
  async function save(): Promise<RunResult> {
    setMessage(null);
    setError(null);
    setProblems([]);
    const r = await saveTitleSummary(letterId, title, summary);
    if (r.error) {
      setError(r.error);
      setProblems(r.problems);
      return { ok: false, text: r.error };
    }
    const text = "제목 · 요약을 저장했습니다. 상태는 그대로입니다.";
    setMessage(text);
    router.refresh();
    return { ok: true, text };
  }

  return (
    <section className="space-y-2 rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4 text-xs">
      <h2 className="text-sm font-medium">제목 · 한 문장 요약</h2>
      <label className="block">
        <span className="text-muted-foreground">제목</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-background px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-muted-foreground">한 문장 요약</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-background px-2.5 py-1.5 text-sm"
        />
      </label>
      <TitleSuggestBox
        letterId={letterId}
        ready={suggestReady}
        initial={suggestions}
        onPick={(it) => {
          setTitle(it.title);
          setSummary(it.summary);
        }}
      />
      <div className="flex items-center gap-2">
        <ActionButton
          run={save}
          disabled={!changed}
          pendingText="저장 중…"
          className="rounded-md border border-[color:var(--accent)] px-3 py-1.5 text-foreground hover:bg-[color:var(--accent)]/10 disabled:opacity-40"
        >
          제목·요약 저장
        </ActionButton>
        <span className="text-muted-foreground">두 칸만 바꿉니다. 리뷰 상태는 그대로입니다.</span>
      </div>
      {message && <p className="text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
      {problems.length > 0 && (
        <ul className="list-disc pl-4 text-red-700 dark:text-red-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
