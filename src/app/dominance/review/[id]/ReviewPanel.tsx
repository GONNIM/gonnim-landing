"use client";

// 리뷰 화면의 조작부. 글은 읽기만 하고, 판단은 사람이 한다.

import { useState } from "react";
import { ActionButton, type RunResult } from "../../_ui/ActionButton";
import { useActionStatus } from "../../_ui/ActionStatus";
import { STAGES } from "../../_ui/Progress";
import { useRouter } from "next/navigation";
import { CROSS_REVIEW_KIND_LABEL } from "@/lib/dominance/cross-review";
import { isBlockingCheck } from "@/lib/dominance/review";
import {
  BLOCK_LABEL,
  REVIEW_CHECK_LABEL,
  type CrossReviewNote,
  type CrossReviewRun,
  type LetterBlock,
  type LetterStatus,
  type ReviewCheck,
} from "@/lib/dominance/types";
import {
  passReview,
  requestCrossReview,
  revertToDraft,
  sendTestEmail,
} from "./actions";

type Source = { label: string; title: string; url: string; license: string };

// 기계가 대신할 수 없는 확인 세 가지. 세 개를 모두 체크해야 [리뷰 통과] 가 열린다.
const SELF_CHECKS = [
  "원천에 없는 사실 문장이 없는지 직접 읽고 확인했습니다.",
  "의학적 지시로 읽힐 문장이 없는지 확인했습니다.",
  "[내게 테스트 발송] 으로 메일 모양을 확인했습니다.",
] as const;

export function ReviewPanel({
  letterId,
  status,
  summary,
  blocks,
  sources,
  checks,
  savedCrossReview,
  savedRuns = null,
  meaning = null,
}: {
  letterId: string;
  status: LetterStatus;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  sources: Source[];
  checks: ReviewCheck[];
  savedCrossReview: CrossReviewNote[] | null;
  /** D47 · 모델별 실행 기록(실패 표시용) */
  savedRuns?: CrossReviewRun[] | null;
  /** 45차 C · D50 · 쓰인 문장 뜻 확인 수(알림만 · 리뷰 통과는 막지 않음). 해당 없는 글은 null */
  meaning?: { used: number; verified: number } | null;
}) {
  const router = useRouter();
  const { busy: pending } = useActionStatus();

  const [notes, setNotes] = useState<CrossReviewNote[] | null>(
    savedCrossReview,
  );
  const [runs, setRuns] = useState<CrossReviewRun[] | null>(savedRuns);
  const [ticked, setTicked] = useState<boolean[]>(SELF_CHECKS.map(() => false));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocking = checks.filter((c) => !c.passed && isBlockingCheck(c.code));
  const allTicked = ticked.every(Boolean);
  const canPass =
    status === "review" && blocking.length === 0 && allTicked && !pending;

  // 56차 C · 처리 함수는 결과 글자를 돌려준다. ActionButton 이 알림 띠로 낸다. 아래쪽 결과 글자는 그대로 둔다.
  async function run(
    action: () => Promise<{ error: string | null }>,
    onDone: () => void,
    okText: string,
  ): Promise<RunResult> {
    setError(null);
    setMessage(null);
    const result = await action();
    if (result.error) {
      setError(result.error);
      return { ok: false, text: result.error };
    }
    onDone();
    return { ok: true, text: okText };
  }

  async function onCrossReview(): Promise<RunResult> {
    setError(null);
    setMessage(null);
    const result = await requestCrossReview(letterId);
    if (result.error) {
      setError(result.error);
      return { ok: false, text: result.error };
    }
    setNotes(result.notes);
    setRuns(result.runs);
    const text =
      result.notes.length === 0
        ? "교차 리뷰가 지적할 것을 찾지 못했습니다."
        : `교차 리뷰 의견 ${result.notes.length}건을 받았습니다.`;
    setMessage(text);
    return { ok: true, text };
  }

  async function onTestSend(): Promise<RunResult> {
    setError(null);
    setMessage(null);
    const result = await sendTestEmail(letterId);
    if (result.error) {
      setError(result.error);
      return { ok: false, text: result.error };
    }
    const text = `${result.to} 로 테스트 메일을 보냈습니다.`;
    setMessage(text);
    return { ok: true, text };
  }

  function onPass() {
    return run(
      () => passReview(letterId),
      () => router.push("/dominance/schedule"),
      "리뷰를 통과했습니다. ⑤ 발행일로 옮겨 갑니다.",
    );
  }

  function onRevert() {
    return run(
      () => revertToDraft(letterId, reason),
      () => router.push(`/dominance/letters/${letterId}`),
      "수정으로 되돌렸습니다. 편집 화면으로 옮겨 갑니다.",
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* 왼쪽 · 글 */}
      <div className="space-y-5">
        {summary && (
          <p className="rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4 text-sm leading-relaxed text-foreground/90">
            {summary}
          </p>
        )}

        {blocks.map((b, i) => (
          <article
            key={`${b.kind}-${i}`}
            className="rounded-lg border border-[color:var(--border)]/70 bg-surface/20 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                [{i}] {BLOCK_LABEL[b.kind]}
              </span>
              {b.flags?.map((f) => (
                <span
                  key={f}
                  className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300"
                >
                  {f}
                </span>
              ))}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {b.text.trim() || "(비어 있음)"}
            </p>
          </article>
        ))}

        <section className="rounded-lg border border-[color:var(--border)]/70 bg-surface/20 p-4">
          <h2 className="text-xs font-semibold text-foreground/85">원천</h2>
          <ul className="mt-2 space-y-1.5">
            {sources.length === 0 ? (
              <li className="text-xs text-red-700 dark:text-red-300">
                원천이 하나도 연결되지 않았습니다.
              </li>
            ) : (
              sources.map((s) => (
                <li key={s.url} className="text-xs text-muted-foreground">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--accent)] hover:underline"
                  >
                    {s.title}
                  </a>{" "}
                  · {s.label} · {s.license}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* 오른쪽 · 점검 */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4">
          <h2 className="text-sm font-medium">자동 점검</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            🔴 표시는 통과를 막습니다. ⚠️ 표시는 알려만 드립니다. ‘참고’ 항목은 기계 초안의 기준이며,
            사람이 편집한 글은 막는 4개와 교차 리뷰로 판정합니다(D49).
          </p>
          <ul className="mt-3 space-y-2">
            {checks.map((c) => {
              const bad = !c.passed;
              const hard = isBlockingCheck(c.code);
              // 통과했지만 확인 불가가 남은 경우 (링크 403 · 429). 막지 않고 눈에 띄게만 한다.
              const soft = c.passed && c.warning === true;
              return (
                <li key={c.code} className="text-xs">
                  <div className="flex gap-2">
                    <span className="shrink-0">
                      {soft ? "⚠️" : c.passed ? "✅" : hard ? "🔴" : "⚠️"}
                    </span>
                    <span
                      className={
                        bad
                          ? hard
                            ? "text-red-700 dark:text-red-300"
                            : "text-amber-700 dark:text-amber-300"
                          : soft
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-foreground/85"
                      }
                    >
                      {REVIEW_CHECK_LABEL[c.code]}
                    </span>
                    {/* D49 · 경고 8개(5~12번)는 사람 편집본에 참고치다 */}
                    {!hard && (
                      <span className="shrink-0 rounded bg-[color:var(--muted)]/30 px-1 text-[10px] text-muted-foreground">
                        참고
                      </span>
                    )}
                  </div>
                  {c.detail && (
                    <p className="ml-6 mt-0.5 break-words text-[11px] text-muted-foreground">
                      {c.detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">교차 리뷰</h2>
            <ActionButton
              run={onCrossReview}
              disabled={pending}
              stages={STAGES.cross}
              pendingText="요청 중…"
              className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-50"
            >
              {notes === null ? "요청하기" : "다시 요청"}
            </ActionButton>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            두 모델(main · light)에게 다른 지시문으로 동시에 묻고 의견을 합칩니다(D47). 의견만 받고 글은
            고치지 않습니다.
          </p>
          {runs?.some((r) => !r.ok) && (
            <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">
              {runs
                .filter((r) => !r.ok)
                .map((r) => `${r.tier}(${r.model}) 호출 실패 · 다른 모델의 의견만 보입니다: ${r.error}`)
                .join(" / ")}
            </p>
          )}
          {notes === null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              아직 요청하지 않았습니다.
            </p>
          ) : notes.length === 0 ? (
            <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
              지적할 것을 찾지 못했습니다.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notes.map((n, i) => (
                <li
                  key={i}
                  className="rounded border-l-2 border-amber-500/60 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5"
                >
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    {CROSS_REVIEW_KIND_LABEL[n.kind]}
                    {n.blockIndex !== null && ` · 블록 [${n.blockIndex}]`}
                    {n.models && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {n.models.length === 2 ? "두 모델" : n.models[0]}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground/85">
                    {n.message}
                  </p>
                  {n.otherMessage && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      light: {n.otherMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4">
          {meaning && (
            <p
              className={`mb-3 rounded-md border px-2.5 py-1.5 text-xs ${
                meaning.verified < meaning.used
                  ? "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-200"
                  : "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/10 dark:text-emerald-300"
              }`}
            >
              쓰인 문장 뜻 확인 {meaning.verified}/{meaning.used} · 발행 승인 전에 모두 확인해야 합니다
            </p>
          )}
          <h2 className="text-sm font-medium">내가 직접 확인할 것</h2>
          <ul className="mt-3 space-y-2">
            {SELF_CHECKS.map((label, i) => (
              <li key={label}>
                <label className="flex cursor-pointer gap-2 text-xs leading-relaxed text-foreground/85">
                  <input
                    type="checkbox"
                    checked={ticked[i]}
                    onChange={(e) =>
                      setTicked((prev) =>
                        prev.map((v, j) => (j === i ? e.target.checked : v)),
                      )
                    }
                    className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--accent)]"
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
          <ActionButton
            run={onTestSend}
            disabled={pending}
            pendingText="보내는 중…"
            className="mt-3 w-full rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-50"
          >
            내게 테스트 발송
          </ActionButton>
        </section>

        <section className="space-y-2 rounded-lg border border-[color:var(--border)]/70 bg-surface/30 p-4">
          <ActionButton
            run={onPass}
            disabled={!canPass}
            className="w-full rounded-md bg-violet-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-[color:var(--muted)]/30 disabled:text-muted-foreground"
          >
            리뷰 통과
          </ActionButton>
          <p className="text-[11px] text-muted-foreground">
            {status !== "review"
              ? "리뷰 대기 상태의 글만 통과시킬 수 있습니다."
              : blocking.length > 0
                ? `막는 항목 ${blocking.length}건을 먼저 고쳐야 합니다.`
                : !allTicked
                  ? "위 세 가지를 모두 확인해 주십시오."
                  : "통과시키면 발행일을 붙일 수 있습니다."}
          </p>

          {status !== "published" && status !== "draft" && (
          <div className="mt-3 border-t border-[color:var(--border)]/60 pt-3">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="되돌리는 이유를 한 줄로"
              className="w-full rounded-md border border-[color:var(--border)] bg-background/60 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]"
            />
            <ActionButton
              run={onRevert}
              disabled={pending}
              className="mt-2 w-full rounded-md border border-amber-500/50 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
            >
              수정으로 되돌리기
            </ActionButton>
            {status === "approved" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                발행 예정 글입니다. 되돌리면 발행일과 승인 기록도 지워집니다.
              </p>
            )}
          </div>
          )}
        </section>

        {message && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-200">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
