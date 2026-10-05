"use client";

// 48차 A · D51 · 「제목·요약 추천 받기」 단추와 결과 묶음 3개. ③ 편집 화면과 ④ 리뷰 화면이 같이 쓴다.
// 묶음을 누르면 onPick 으로 제목 · 한 문장 요약을 넘긴다(저장은 부르는 쪽이 한다).

import { useState, useTransition } from "react";
import { requestTitleSuggestions } from "./title-actions";
import type { TitleSuggestion, TitleSuggestions } from "@/lib/dominance/title-suggest";
import { TITLE_TYPE_LABEL } from "@/lib/dominance/title-types";

export function TitleSuggestBox({
  letterId,
  ready,
  initial,
  disabled,
  onPick,
}: {
  letterId: string;
  /** OPENAI_API_KEY 가 있는가 */
  ready: boolean;
  initial: TitleSuggestions | null;
  disabled?: boolean;
  onPick: (item: TitleSuggestion) => void;
}) {
  const [result, setResult] = useState<TitleSuggestions | null>(initial);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    setError(null);
    setDone(null);
    const t0 = Date.now();
    startTransition(async () => {
      const r = await requestTitleSuggestions(letterId);
      if (r.error) setError(r.error);
      else {
        setResult(r.result);
        setDone(`묶음 ${r.result?.items.length ?? 0}개를 받았습니다 (${Math.round((Date.now() - t0) / 1000)}초)`);
      }
    });
  }

  return (
    <div className="space-y-2 text-xs">
      <button
        type="button"
        onClick={ask}
        disabled={!ready || pending || disabled}
        className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground/85 hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!ready ? "OPENAI_API_KEY 없음" : pending ? "추천 받는 중…" : "제목·요약 추천 받기"}
      </button>
      {done && <p className="text-emerald-700 dark:text-emerald-300">{done}</p>}
      {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
      {result && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground">
            추천 {result.items.length}묶음 · 누르면 「제목」 · 「한 문장 요약」 칸에 들어갑니다 · {result.model} 로 추천
            {result.dropped.length > 0 && ` · 규칙에 걸려 뺀 묶음 ${result.dropped.length}개`}
            {result.fallback_from === "openai" && (
              <span className="text-muted-foreground/70"> · OpenAI 사용 불가({result.fallback_reason}) · GLM 으로 대신 추천</span>
            )}
          </p>
          {result.items.map((it) => (
            <button
              key={it.title}
              type="button"
              disabled={disabled}
              onClick={() => onPick(it)}
              className="block w-full rounded-md border border-[color:var(--border)]/70 px-2.5 py-2 text-left hover:border-[color:var(--accent)] disabled:opacity-60"
            >
              <span className="block text-sm font-medium text-foreground">
                {it.type && <span className="mr-1.5 rounded border border-[color:var(--border)] px-1 py-px text-[10px] font-normal text-muted-foreground">{TITLE_TYPE_LABEL[it.type]}</span>}
                {it.title}
              </span>
              <span className="mt-0.5 block text-sm text-foreground/85">{it.summary}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{it.why}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
