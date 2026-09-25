"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishWriting, saveLetter } from "./actions";
import { BLOCK_LABEL, type LetterBlock, type LetterStatus } from "@/lib/dominance/types";

const AUTOSAVE_DELAY_MS = 3000;

export type EditorSource = {
  label: string;
  title: string;
  url: string;
  abstract: string | null;
  attribution: string | null;
};

export function LetterEditor({
  letterId,
  status,
  initialTitle,
  initialSummary,
  initialBlocks,
  sources,
}: {
  letterId: string;
  status: LetterStatus;
  initialTitle: string;
  initialSummary: string;
  initialBlocks: LetterBlock[];
  sources: EditorSource[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const readOnly = status !== "draft";
  const flagCount = blocks.reduce((n, b) => n + (b.flags?.length ?? 0), 0);
  const emptyCount = blocks.filter((b) => !b.text.trim()).length;

  // 최신 값을 타이머 콜백에서 읽기 위한 통로. 타이머를 값마다 다시 걸지 않는다.
  const latest = useRef({ title, summary, blocks });
  latest.current = { title, summary, blocks };

  const persist = useCallback(async () => {
    setBusy(true);
    const res = await saveLetter(letterId, latest.current);
    setBusy(false);
    if (res.error) {
      setMessage(`저장 실패 · ${res.error}`);
      return;
    }
    setBlocks(res.blocks);
    setSavedAt(res.savedAt);
    setMessage(null);
  }, [letterId]);

  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (readOnly || !dirty) return;
    const timer = setTimeout(() => {
      setDirty(false);
      void persist();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, readOnly, persist, title, summary, blocks]);

  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        setDirty(false);
        void persist();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, persist]);

  function editBlock(index: number, text: string) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, text } : b)));
    setDirty(true);
  }

  async function submit() {
    setBusy(true);
    const { error } = await finishWriting(letterId, latest.current);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    router.push(`/dominance/review/${letterId}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-sm font-medium text-muted-foreground">
          원천 {sources.length}개
        </h2>
        {sources.length === 0 && (
          <p className="rounded-xl border border-dashed border-red-500/40 p-4 text-xs text-red-300">
            연결된 원천이 없습니다. 이 상태로는 리뷰를 통과하지 못합니다.
          </p>
        )}
        {sources.map((s) => (
          <article
            key={s.url}
            className="rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-4"
          >
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 block text-sm text-foreground underline decoration-dotted hover:text-white"
            >
              {s.title} ↗
            </a>
            {s.abstract && (
              <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {s.abstract}
              </p>
            )}
            {s.attribution && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                출처표시 · {s.attribution}
              </p>
            )}
          </article>
        ))}
      </aside>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor="ds-title">
            제목
          </label>
          <input
            id="ds-title"
            value={title}
            readOnly={readOnly}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="w-full rounded-lg border border-[color:var(--border)]/70 bg-surface/30 px-3 py-2 text-base text-foreground read-only:opacity-70"
          />
          <label className="block text-xs text-muted-foreground" htmlFor="ds-summary">
            한 문장 요약
          </label>
          <input
            id="ds-summary"
            value={summary}
            readOnly={readOnly}
            onChange={(e) => {
              setSummary(e.target.value);
              setDirty(true);
            }}
            className="w-full rounded-lg border border-[color:var(--border)]/70 bg-surface/30 px-3 py-2 text-sm text-foreground read-only:opacity-70"
          />
        </div>

        {blocks.map((b, i) => (
          <section
            key={b.kind}
            className={`rounded-xl border p-4 ${
              b.flags?.length
                ? "border-red-500/60 bg-red-950/10"
                : "border-[color:var(--border)]/70 bg-surface/30"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {BLOCK_LABEL[b.kind]}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {b.text.length}자
              </span>
            </div>
            {b.flags?.map((f) => (
              <p key={f} className="mt-1 text-xs text-red-300">
                {f}
              </p>
            ))}
            <textarea
              value={b.text}
              readOnly={readOnly}
              rows={b.kind === "summary" ? 4 : 5}
              onChange={(e) => editBlock(i, e.target.value)}
              className="mt-2 w-full resize-y rounded-lg border border-[color:var(--border)]/50 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground read-only:opacity-70"
            />
          </section>
        ))}

        {message && (
          <p className="rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">
            {message}
          </p>
        )}

        {!readOnly && (
          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-[color:var(--border)]/70 bg-background/90 p-4 backdrop-blur">
            <div className="text-xs text-muted-foreground">
              {busy
                ? "저장 중…"
                : savedAt
                  ? `저장됨 ${new Date(savedAt).toLocaleTimeString("ko-KR")}`
                  : "3초 동안 입력이 없으면 자동 저장합니다"}
              {flagCount > 0 && (
                <span className="ml-2 text-red-300">필터 경고 {flagCount}건</span>
              )}
              {emptyCount > 0 && (
                <span className="ml-2 text-amber-300">빈 블록 {emptyCount}개</span>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy || flagCount > 0 || emptyCount > 0}
              className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
              title={
                flagCount > 0
                  ? "필터 경고를 먼저 고치십시오"
                  : emptyCount > 0
                    ? "빈 블록을 채우십시오"
                    : "리뷰로 올립니다"
              }
            >
              작성 완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
