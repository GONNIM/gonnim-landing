"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EvidenceRun } from "@/lib/dominance/collect-types";
import {
  CARD_TARGET,
  EXT_KINDS,
  EXT_KIND_LABEL,
  EXT_LICENSES,
  LICENSE_LABEL,
  SLOTS,
  SLOT_LABEL,
  SOURCE_PART_LABEL,
  type EvidenceTable,
  type Fact,
  type SourceGroup,
  type Slot,
} from "@/lib/dominance/evidence";
import type { QuestionStatus } from "@/lib/dominance/questions";
import { Btn } from "../../ui";
import { runCollect } from "../../runCollect";
import {
  writeDraftAction,
  addExternalAction,
  addFactAction,
  addPaperAction,
  deleteFactAction,
  moveFactAction,
  removeSourceAction,
  setFactKoAction,
  setTagAction,
  updateFactMetaAction,
} from "./actions";

const input = "rounded-md border border-[color:var(--border)] bg-background px-2 py-1 text-xs text-foreground";

export function EvidenceBoard({
  questionId,
  status,
  table,
  run,
  letter,
  usedIds = [],
}: {
  usedIds?: string[];
  questionId: string;
  status: QuestionStatus;
  table: EvidenceTable;
  run: EvidenceRun | null;
  letter: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canCollect = ["validated", "adopted", "drafted"].includes(status);

  const act = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? `실패 · ${r.error}` : ok ?? null);
      router.refresh();
    });

  const canWrite = ["adopted", "drafted"].includes(status) && table.filledSlots >= 3;
  const [writing, setWriting] = useState(false);
  const allFacts = SLOTS.flatMap((s) => table.slots[s].flatMap((g) => g.facts));
  const unverified = allFacts.filter((f) => !f.koVerifiedAt).length;
  async function write() {
    // D44 · 초안은 확인된 뜻만 받는다. 확인 안 된 뜻이 있어도 운영자가 고르면 진행한다.
    if (unverified > 0 && !window.confirm(`확인되지 않은 뜻 ${unverified}개가 있습니다. 확인하지 않은 뜻으로 글을 씁니다. 진행할까요?`)) return;
    if (letter && !window.confirm("새 판을 만듭니다. 지금 글은 파일로 보관되고 본문이 바뀝니다.")) return;
    setWriting(true);
    setMsg("사실 카드로 초안을 쓰는 중입니다(1분 안팎)…");
    const r = await writeDraftAction(questionId);
    setWriting(false);
    if (!r.ok) {
      setMsg(`글 작성 실패 · ${r.error}`);
      return;
    }
    router.push(`/dominance/letters/${r.letterId}`);
  }

  async function collect() {
    setMsg(null);
    const r = await runCollect(questionId, setProgress);
    setProgress(null);
    setMsg(r.error ? `증거 모으기 실패 · ${r.error}` : "증거 모으기를 마쳤습니다");
    router.refresh();
  }

  const pct = Math.min(100, Math.round((table.factCount / CARD_TARGET) * 100));
  const sources = SLOTS.flatMap((s) => table.slots[s].map((g) => g.source)).filter(
    (s, i, all) => all.findIndex((x) => x.key === s.key) === i,
  );

  // 25차 C · 글에 쓰인 문장(뜻 확인이 필요한 범위)
  const usedSet = new Set(usedIds);
  const usedList = SLOTS.flatMap((slot) =>
    table.slots[slot].flatMap((g) =>
      g.facts.filter((f) => usedSet.has(`${f.rowId}:${f.line}`)).map((f) => ({ f, slot, tag: g.source.tag, title: g.source.title })),
    ),
  );
  const usedVerified = usedList.filter((x) => x.f.koVerifiedAt).length;

  return (
    <div className="space-y-6">
      {letter && (
        <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="text-base font-medium">
            글에 쓰인 문장 {usedList.length}개 중 확인 {usedVerified}개
          </h2>
          <p className="text-xs text-muted-foreground">
            뜻 확인은 이 문장들만 하시면 됩니다. 나머지 카드 문장은 확인하지 않아도 됩니다(런북 13번).
          </p>
          <ol className="space-y-2">
            {usedList.map(({ f, slot, tag, title }) => (
              <div key={`${f.rowId}-${f.line}`}>
                <p className="text-[11px] text-muted-foreground">
                  {tag} · {SLOT_LABEL[slot]} · {title.slice(0, 80)}
                </p>
                <FactRow f={f} slot={slot} questionId={questionId} busy={pending} act={act} />
              </div>
            ))}
          </ol>
        </section>
      )}

      {/* 막대 두 개 · D37 카드 목표와 재료 네 칸 */}
      <section className="space-y-3 rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-4">
        <div>
          <div className="flex justify-between text-sm">
            <span>
              카드 <b>{table.factCount}</b> / {CARD_TARGET}문장
            </span>
            <span className="text-muted-foreground">{table.factCount >= CARD_TARGET ? "목표 도달" : `${CARD_TARGET - table.factCount}문장 모자람`}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-[color:var(--border)]/50">
            <div className="h-full bg-[color:var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            채워진 칸 <b>{table.filledSlots}</b> / 4
          </span>
          <span className="text-xs text-muted-foreground">
            {SLOTS.map((s) => `${SLOT_LABEL[s]} ${table.slots[s].length ? "✓" : "—"}`).join(" · ")}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {letter && (
              <a href={`/dominance/letters/${letter.id}`} className="text-xs text-foreground underline">
                초안 열기
              </a>
            )}
            <button
              type="button"
              onClick={write}
              disabled={!canWrite || writing || pending || (letter !== null && letter.status !== "draft")}
              title={
                canWrite
                  ? letter
                    ? "새 판을 만듭니다(이전 판은 파일로 보관)"
                    : "사실 카드만으로 초안을 씁니다"
                  : "채택한 질문이고 재료 칸 3개 이상일 때 열립니다"
              }
              className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-background disabled:opacity-40"
            >
              {writing ? "쓰는 중…" : letter ? "글 작성하기 (새 판)" : "글 작성하기"}
              {unverified > 0 ? ` · 확인되지 않은 뜻 ${unverified}개` : ""}
            </button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={collect} disabled={!canCollect || pending || progress !== null} accent>
            {progress ?? "증거 모으기"}
          </Btn>
          {!canCollect && <span className="text-xs text-muted-foreground">검증을 통과했거나 채택한 질문만 모읍니다.</span>}
          {msg && <span className="text-xs text-foreground/80">{msg}</span>}
        </div>
        {run && <RunSummary run={run} />}
      </section>

      {SLOTS.map((slot) => (
        <SlotSection
          key={slot}
          slot={slot}
          groups={table.slots[slot]}
          allSources={sources}
          questionId={questionId}
          busy={pending}
          act={act}
        />
      ))}
    </div>
  );
}

function RunSummary({ run }: { run: EvidenceRun }) {
  const ms = run.phases.reduce((n, p) => n + p.ms, 0);
  return (
    <div className="space-y-2 border-t border-[color:var(--border)]/50 pt-3 text-xs text-muted-foreground">
      <p>
        마지막 실행 {run.updatedAt.slice(0, 16).replace("T", " ")} · {(ms / 1000).toFixed(0)}초 · LLM {run.llmCalls}회 ·
        Europe PMC {run.epmcCalls}회 · 새 문장 {run.added} · 대조 실패 {run.verifyFailed} · 중복 {run.duplicates}
      </p>
      <p>
        {SLOTS.map((s) => `${SLOT_LABEL[s]} 원천 ${run.perSlot[s].sources} · 문장 ${run.perSlot[s].facts}`).join("  |  ")}
      </p>
      <p>
        검색어 {run.queries.join(" / ")}
        {run.retryQueries ? ` → 다시 쓴 검색어 ${run.retryQueries.join(" / ")}` : ""}
      </p>
      <ul className="space-y-0.5">
        {run.phases.map((p, i) => (
          <li key={i}>
            · {p.phase} ({(p.ms / 1000).toFixed(1)}초) — {p.note}
          </li>
        ))}
      </ul>
      {run.industry.length > 0 && (
        <div>
          <p className="text-foreground/80">산업 칸 후보 · 열어 보고 맞으면 산업 칸의 [외부 원천]에 직접 넣으십시오.</p>
          <ul className="mt-1 space-y-1">
            {run.industry.map((l) => (
              <li key={l.name}>
                <b className="text-foreground/90">{l.name}</b> — {l.why}{" "}
                <a className="underline" href={l.edgar.url} target="_blank" rel="noreferrer noopener">
                  EDGAR
                </a>
                {" · "}
                {l.reporter.url ? (
                  <a className="underline" href={l.reporter.url} target="_blank" rel="noreferrer noopener">
                    RePORTER{l.reporter.count !== null ? ` ${l.reporter.count}건` : ""}
                  </a>
                ) : (
                  "RePORTER 조회 실패"
                )}
                {l.dart && (
                  <>
                    {" · "}
                    <a className="underline" href={l.dart} target="_blank" rel="noreferrer noopener">
                      DART
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {run.errors.length > 0 && <p className="text-red-300">{run.errors.join(" / ")}</p>}
    </div>
  );
}

type Act = (fn: () => Promise<{ error: string | null }>, ok?: string) => void;

function SlotSection({
  slot,
  groups,
  allSources,
  questionId,
  busy,
  act,
}: {
  slot: Slot;
  groups: SourceGroup[];
  allSources: SourceGroup["source"][];
  questionId: string;
  busy: boolean;
  act: Act;
}) {
  const facts = groups.reduce((n, g) => n + g.facts.length, 0);
  const verified = groups.reduce((n, g) => n + g.facts.filter((f) => f.koVerifiedAt).length, 0);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">
        {SLOT_LABEL[slot]}{" "}
        <span className="text-sm text-muted-foreground">
          원천 {groups.length} · 문장 {facts} ·{" "}
          <span className={verified < facts ? "text-amber-300" : "text-emerald-300"}>
            확인 {verified} / {facts}
          </span>
        </span>
      </h2>
      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-4 text-sm text-muted-foreground">
          비어 있습니다.
        </p>
      )}
      {groups.map((g) => (
        <SourceCard key={g.source.key} slot={slot} g={g} questionId={questionId} busy={busy} act={act} />
      ))}
      <AddFact slot={slot} sources={allSources.filter((s) => !s.linkOnly)} questionId={questionId} />
      <AddSource slot={slot} questionId={questionId} act={act} busy={busy} />
    </section>
  );
}

function SourceCard({
  slot,
  g,
  questionId,
  busy,
  act,
}: {
  slot: Slot;
  g: SourceGroup;
  questionId: string;
  busy: boolean;
  act: Act;
}) {
  const s = g.source;
  const [tag, setTag] = useState(s.tag ?? "");
  return (
    <div className="rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value.toUpperCase())}
          onBlur={() => tag !== (s.tag ?? "") && act(() => setTagAction(questionId, s.key, tag), `태그를 ${tag} 로 바꿨습니다`)}
          className={`${input} w-14 font-mono`}
          aria-label="태그"
        />
        <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-foreground underline-offset-2 hover:underline">
          {s.title}
        </a>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {s.kind === "paper" ? `논문 ${s.externalId ?? ""}` : s.kind === "press" ? "보도자료" : EXT_KIND_LABEL[s.extKind ?? ""] ?? "외부 원천"} ·{" "}
        {LICENSE_LABEL[s.license ?? ""] ?? s.license ?? "라이선스 없음"}
        {s.linkOnly ? " · 문장 칸 잠김(링크만)" : ""}
      </p>
      {g.notes.map((n, i) => (
        <p key={i} className="mt-1 text-xs text-foreground/80">
          메모 · {n}
        </p>
      ))}
      <ol className="mt-3 space-y-2">
        {g.facts.map((f) => (
          <FactRow key={`${f.rowId}-${f.line}`} f={f} slot={slot} questionId={questionId} busy={busy} act={act} />
        ))}
      </ol>
      <div className="mt-2 text-right">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`${s.tag ?? ""} 원천을 ${SLOT_LABEL[slot]} 칸에서 뺍니다. 이 칸의 문장 ${g.facts.length}개도 함께 빠집니다.`))
              act(() => removeSourceAction(questionId, slot, s.key), "원천을 뺐습니다");
          }}
          className="text-xs text-muted-foreground hover:text-red-300"
        >
          이 칸에서 원천 빼기
        </button>
      </div>
    </div>
  );
}

function FactRow({ f, slot, questionId, busy, act }: { f: Fact; slot: Slot; questionId: string; busy: boolean; act: Act }) {
  const [subject, setSubject] = useState(f.subject ?? "");
  const [ko, setKo] = useState(f.ko ?? "");
  const changed = ko.trim() !== (f.ko ?? "");
  return (
    <li className="rounded-lg border border-[color:var(--border)]/50 p-2.5">
      <p className="text-sm text-foreground">{f.text}</p>
      {/* D44 · 확인된 뜻. 초안은 이 칸만 받는다. 미확인은 노랑 */}
      <div className={`mt-2 rounded-md border p-2 ${f.koVerifiedAt && !changed ? "border-emerald-500/40" : "border-amber-500/50 bg-amber-500/5"}`}>
        <textarea
          value={ko}
          onChange={(e) => setKo(e.target.value)}
          rows={2}
          placeholder="한국어 뜻이 아직 없습니다"
          className={`${input} w-full`}
          aria-label="확인된 뜻"
        />
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className={f.koVerifiedAt && !changed ? "text-emerald-300" : "text-amber-300"}>
            {f.koVerifiedAt && !changed ? `확인됨 ${f.koVerifiedAt.slice(0, 10)}` : changed ? "고침 · 아직 확인 안 됨" : "확인 안 됨"}
          </span>
          <button
            type="button"
            disabled={busy || !ko.trim() || (!!f.koVerifiedAt && !changed)}
            onClick={() => act(() => setFactKoAction(questionId, f.rowId, f.line, ko, true), "뜻을 확인했습니다")}
            className="rounded border border-[color:var(--border)] px-2 py-0.5 hover:border-emerald-400 disabled:opacity-40"
          >
            확인
          </button>
          {changed && (
            <button
              type="button"
              disabled={busy || !ko.trim()}
              onClick={() => act(() => setFactKoAction(questionId, f.rowId, f.line, ko, false), "뜻을 고쳤습니다(미확인)")}
              className="rounded border border-[color:var(--border)] px-2 py-0.5 disabled:opacity-40"
            >
              고친 뜻만 저장
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          대상
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() =>
              subject !== (f.subject ?? "") &&
              act(() => updateFactMetaAction(questionId, f.rowId, f.line, { subject: subject.trim() || null }), "대상을 고쳤습니다")
            }
            className={`${input} w-44`}
          />
        </label>
        <span>연도 {f.year ?? "—"}</span>
        <span>수치 {f.hasNumber === null ? "—" : f.hasNumber ? "있음" : "없음"}</span>
        <span className={f.verifiedAt ? "text-emerald-300" : ""}>
          {f.verifiedAt
            ? `원문 대조 ✓ ${f.sourcePart ? SOURCE_PART_LABEL[f.sourcePart] : ""} · ${f.verifiedAt.slice(0, 10)}`
            : "대조 기록 없음"}
        </span>
        <select
          value={slot}
          disabled={busy}
          onChange={(e) => act(() => moveFactAction(questionId, f.rowId, f.line, e.target.value as Slot), "칸을 옮겼습니다")}
          className={input}
          aria-label="칸 이동"
        >
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]} 칸
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm("이 문장을 뺍니다.") && act(() => deleteFactAction(questionId, f.rowId, f.line), "문장을 뺐습니다")}
          className="hover:text-red-300"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function AddFact({ slot, sources, questionId }: { slot: Slot; sources: SourceGroup["source"][]; questionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground">
        + 문장 추가
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-[color:var(--border)] p-3">
      <select value={key} onChange={(e) => setKey(e.target.value)} className={`${input} w-full`}>
        <option value="">원천을 고르십시오</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.tag ?? "?"} · {s.title.slice(0, 90)}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="원문 문장을 그대로 붙여 넣으십시오. 저장할 때 초록(없으면 본문)과 글자 그대로 대조합니다."
        className={`${input} w-full`}
      />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="대상(예: 영국 성인 72,174명)" className={`${input} w-full`} />
      <div className="flex items-center gap-2">
        <Btn
          accent
          disabled={pending || !key || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await addFactAction(questionId, slot, key, { text, subject: subject.trim() || null, year: null, hasNumber: null });
              if (r.ok) {
                setMsg(`대조 통과(${r.part === "body" ? "본문" : "초록"}) · 저장했습니다`);
                setText("");
                setSubject("");
                router.refresh();
              } else setMsg(`저장하지 않았습니다 · ${r.reason}`);
            })
          }
        >
          {pending ? "대조 중…" : "대조하고 저장"}
        </Btn>
        <Btn onClick={() => setOpen(false)}>닫기</Btn>
      </div>
      {msg && <p className="text-xs text-foreground/80">{msg}</p>}
    </div>
  );
}

function AddSource({ slot, questionId, act, busy }: { slot: Slot; questionId: string; act: Act; busy: boolean }) {
  const [mode, setMode] = useState<"none" | "paper" | "ext">("none");
  const [ref, setRef] = useState("");
  const [x, setX] = useState({ url: "", title: "", kind: "disclosure_us", license: "link_only", memo: "", tag: "" });

  if (mode === "none")
    return (
      <div className="flex gap-3 text-xs text-muted-foreground">
        <button type="button" onClick={() => setMode("paper")} className="hover:text-foreground">
          + 논문 원천(Europe PMC ID)
        </button>
        <button type="button" onClick={() => setMode("ext")} className="hover:text-foreground">
          + 외부 원천(공시 · 연구비 · 기관 등)
        </button>
      </div>
    );

  if (mode === "paper")
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[color:var(--border)] p-3">
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MED:35247352 · PMC12778096" className={`${input} w-64 font-mono`} />
        <Btn
          accent
          disabled={busy || !ref.trim()}
          onClick={() => {
            act(() => addPaperAction(questionId, slot, ref), "논문 원천을 넣었습니다. 이제 문장을 추가하십시오");
            setRef("");
            setMode("none");
          }}
        >
          넣기
        </Btn>
        <Btn onClick={() => setMode("none")}>닫기</Btn>
        <span className="text-xs text-muted-foreground">라이선스가 CC0 · CC BY · 퍼블릭 도메인이 아니면 넣지 않습니다.</span>
      </div>
    );

  return (
    <div className="grid gap-2 rounded-lg border border-dashed border-[color:var(--border)] p-3 text-xs text-muted-foreground sm:grid-cols-2">
      <input value={x.url} onChange={(e) => setX({ ...x, url: e.target.value })} placeholder="URL" className={input} />
      <input value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} placeholder="제목" className={input} />
      <select value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value })} className={input}>
        {EXT_KINDS.map((k) => (
          <option key={k} value={k}>
            {EXT_KIND_LABEL[k]} ({k})
          </option>
        ))}
      </select>
      <select value={x.license} onChange={(e) => setX({ ...x, license: e.target.value })} className={input}>
        {EXT_LICENSES.map((k) => (
          <option key={k} value={k}>
            {LICENSE_LABEL[k]} ({k})
          </option>
        ))}
      </select>
      <textarea value={x.memo} onChange={(e) => setX({ ...x, memo: e.target.value })} placeholder="메모(우리 말로 · 링크만인 원천의 사실은 여기에)" rows={2} className={`${input} sm:col-span-2`} />
      <input value={x.tag} onChange={(e) => setX({ ...x, tag: e.target.value.toUpperCase() })} placeholder="태그(비우면 자동)" className={`${input} font-mono`} />
      <div className="flex gap-2">
        <Btn
          accent
          disabled={busy || !x.url.trim() || !x.title.trim()}
          onClick={() => {
            act(
              () => addExternalAction(questionId, slot, { ...x, memo: x.memo || null, tag: x.tag || null }),
              "외부 원천을 넣었습니다",
            );
            setMode("none");
          }}
        >
          넣기
        </Btn>
        <Btn onClick={() => setMode("none")}>닫기</Btn>
      </div>
      {x.license === "link_only" && <p className="sm:col-span-2">링크만(link_only) 원천은 문장 칸이 잠깁니다. 사실은 메모에 우리 말로 적습니다.</p>}
    </div>
  );
}
