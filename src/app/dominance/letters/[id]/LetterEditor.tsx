"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishWriting, saveGlossary, saveLetter } from "./actions";
import { BLOCK_LABEL, type LetterBlock, type LetterStatus } from "@/lib/dominance/types";
import type { CardFact, CardSource } from "@/lib/dominance/card";
import type { GlossaryItem } from "@/lib/dominance/draft-card";
import { SLOTS, SLOT_LABEL } from "@/lib/dominance/evidence";
import { FACTUAL_KINDS, categoryMark } from "@/lib/dominance/filters";
import { sentencesOf, tagsIn } from "@/lib/dominance/tags";
import type { NumberMismatch } from "@/lib/dominance/card-check";

export type EditorCard = {
  questionId: string;
  facts: CardFact[];
  sources: CardSource[];
  vLine: string | null;
  tags: string[];
};

export type EditorMeta = {
  titles: string[];
  glossary: GlossaryItem[];
  generatedAt: string;
  generation: number;
};

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
  card,
  meta,
  initialMismatches = [],
}: {
  initialMismatches?: NumberMismatch[];
  letterId: string;
  status: LetterStatus;
  initialTitle: string;
  initialSummary: string;
  initialBlocks: LetterBlock[];
  sources: EditorSource[];
  card: EditorCard | null;
  meta: EditorMeta | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 본문에서 누른 문장의 태그 · 왼쪽 카드에서 켜진다.
  const [active, setActive] = useState<string[]>([]);
  // 24차 A-6 · 저장할 때마다 카드 수치 대조 결과가 온다
  const [mismatches, setMismatches] = useState<NumberMismatch[]>(initialMismatches);

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
    setMismatches(res.mismatches);
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
      {card ? (
        <CardPanel card={card} active={active} />
      ) : (
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
      )}

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
          {categoryMark(summary) && <p className="text-xs text-red-300">{categoryMark(summary)}</p>}
          {meta && meta.titles.length > 0 && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>제목 후보 · 누르면 제목 칸에 들어갑니다. 직접 써도 됩니다.</p>
              {meta.titles.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    setTitle(t);
                    setDirty(true);
                  }}
                  className={`block w-full rounded-md border px-2.5 py-1.5 text-left text-sm ${
                    title === t ? "border-[color:var(--accent)] text-foreground" : "border-[color:var(--border)]/60 text-foreground/80"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {meta && <GlossaryEditor letterId={letterId} initial={meta.glossary} readOnly={readOnly} />}

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
            {/* 29차 · 범주 이름은 입력하는 대로 다시 본다(표시만 · 잠그지 않음) */}
            {categoryMark(b.text) && <p className="mt-1 text-xs text-red-300">{categoryMark(b.text)}</p>}
            <textarea
              value={b.text}
              readOnly={readOnly}
              rows={b.kind === "summary" ? 4 : 5}
              onChange={(e) => editBlock(i, e.target.value)}
              onSelect={(e) => {
                if (!card) return;
                const pos = e.currentTarget.selectionStart;
                const sen = sentencesOf(b.text).find((x) => pos >= x.start && pos <= x.end);
                setActive(sen ? tagsIn(sen.text) : []);
              }}
              className="mt-2 w-full resize-y rounded-lg border border-[color:var(--border)]/50 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground read-only:opacity-70"
            />
            {card && <TagLint block={b} cardTags={card.tags} />}
            {mismatches
              .filter((m) => m.blockIndex === i)
              .map((m, j) => (
                <p key={j} className="mt-1 text-xs text-red-300">
                  {m.kind === "odds_percent"
                    ? `가능성 비를 %로 옮김(${m.numbers.join(" · ")}) · "N배" 로 쓴다(D48) · ${m.sentence}`
                    : `카드와 수치가 다름(${m.numbers.join(" · ")}) · ${m.sentence}`}
                </p>
              ))}
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

/** 왼쪽 사실 카드 · 칸별. 본문에서 누른 문장의 태그 카드가 켜진다. */
function CardPanel({ card, active }: { card: EditorCard; active: string[] }) {
  const on = (tag: string) => active.includes(tag);
  return (
    <aside className="max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto lg:sticky lg:top-24 lg:self-start">
      <h2 className="text-sm font-medium text-muted-foreground">
        사실 카드 {card.facts.length}문장 · 본문 문장을 누르면 그 태그가 켜집니다
      </h2>
      {SLOTS.map((slot) => {
        const facts = card.facts.filter((f) => f.slot === slot);
        const linkOnly = card.sources.filter((s) => s.linkOnly && s.slots.includes(slot));
        if (facts.length === 0 && linkOnly.length === 0) return null;
        return (
          <section key={slot} className="space-y-1.5">
            <h3 className="text-xs font-semibold text-foreground/80">{SLOT_LABEL[slot]}</h3>
            {facts.map((f, i) => (
              <p
                key={`${f.tag}-${i}`}
                className={`rounded-md border p-2 text-xs leading-relaxed ${
                  on(f.tag) ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-foreground" : "border-[color:var(--border)]/50 text-muted-foreground"
                }`}
              >
                <b className="font-mono">[{f.tag}]</b> {f.peripheral && <span className="text-amber-300">주변 </span>}
                {f.subject ? `(${f.subject}${f.year ? ` · ${f.year}` : ""}) ` : ""}
                {f.text}
                {/* 22차 C-3 · 켜진 카드는 원문과 확인된 뜻을 함께 보인다 */}
                {on(f.tag) && f.ko && (
                  <span className="mt-1 block text-foreground/90">
                    뜻{f.koVerifiedAt ? "(확인됨)" : "(미확인)"} · {f.ko}
                  </span>
                )}
              </p>
            ))}
            {linkOnly.map((s) => (
              <p
                key={s.tag}
                className={`rounded-md border border-dashed p-2 text-xs ${on(s.tag) ? "border-[color:var(--accent)] text-foreground" : "border-[color:var(--border)]/50 text-muted-foreground"}`}
              >
                <b className="font-mono">[{s.tag}]</b> 링크만 · {s.title} — 메모: {s.memo ?? "없음"}
              </p>
            ))}
          </section>
        );
      })}
      {card.vLine && (
        <p className={`rounded-md border p-2 text-xs ${on("V") ? "border-[color:var(--accent)] text-foreground" : "border-[color:var(--border)]/50 text-muted-foreground"}`}>
          <b className="font-mono">[V]</b> {card.vLine}
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">원천 목록 {card.sources.length}개</summary>
        <ul className="mt-1 space-y-1">
          {card.sources.map((s) => (
            <li key={s.tag}>
              <b className="font-mono">[{s.tag}]</b>{" "}
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline">
                {s.title}
              </a>{" "}
              · {s.kind}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

/** 블록 아래 표시 · 태그 없는 사실 문장(노랑), 카드에 없는 태그(빨강). */
function TagLint({ block, cardTags }: { block: LetterBlock; cardTags: string[] }) {
  const sens = sentencesOf(block.text);
  const untagged = FACTUAL_KINDS.has(block.kind) ? sens.filter((x) => tagsIn(x.text).length === 0) : [];
  const unknown = tagsIn(block.text).filter((t) => !cardTags.includes(t));
  if (untagged.length === 0 && unknown.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {unknown.length > 0 && <p className="text-red-300">카드에 없는 태그: {unknown.map((t) => `[${t}]`).join(" ")}</p>}
      {untagged.map((x, i) => (
        <p key={i} className="text-amber-300">
          태그 없는 문장(사실이면 태그를 붙이고, 잇는 문장이면 그대로 둡니다) · {x.text}
        </p>
      ))}
    </div>
  );
}

/** 용어표 · 고쳐도 본문은 자동으로 바뀌지 않는다. 사람이 본문을 고친다. */
function GlossaryEditor({ letterId, initial, readOnly }: { letterId: string; initial: GlossaryItem[]; readOnly: boolean }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const input = "rounded border border-[color:var(--border)]/60 bg-background/60 px-2 py-1 text-xs text-foreground";
  const set = (i: number, k: keyof GlossaryItem, v: string) =>
    setItems((prev) => prev.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  return (
    <details className="rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-3 text-xs" open>
      <summary className="cursor-pointer text-muted-foreground">
        용어표 {items.length}개 · 첫 등장 형식 &ldquo;쉬운 말(원어)&rdquo; · 고쳐도 본문은 자동으로 바뀌지 않습니다
      </summary>
      <div className="mt-2 space-y-1.5">
        {items.map((g, i) => (
          <div key={i} className="grid gap-1 sm:grid-cols-[1fr_1.4fr_1.4fr]">
            <span className="self-center text-muted-foreground">
              {g.source} {g.kind === "procedure" ? "· 절차" : ""}
            </span>
            <input className={input} value={g.plain} readOnly={readOnly} onChange={(e) => set(i, "plain", e.target.value)} aria-label="쉬운 말" />
            <input className={input} value={g.first} readOnly={readOnly} onChange={(e) => set(i, "first", e.target.value)} aria-label="첫 등장" />
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={async () => {
              const r = await saveGlossary(letterId, items);
              setMsg(r.error ? `저장 실패 · ${r.error}` : "용어표를 저장했습니다. 본문은 직접 고치십시오.");
            }}
            className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
          >
            용어표 저장
          </button>
        )}
        {msg && <p className="text-foreground/80">{msg}</p>}
      </div>
    </details>
  );
}
