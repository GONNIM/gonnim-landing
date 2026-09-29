"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AREAS,
  CREATED_VIA_LABEL,
  SEED_LABEL,
  STATUS_LABEL,
  canAdopt,
  curveLine,
  validationLine,
  type Question,
  type QuestionStatus,
  type SeedKind,
} from "@/lib/dominance/questions";
import type { ProposeBranch } from "@/lib/dominance/question-llm";
import {
  editQuestionAction,
  proposeAction,
  setStatusAction,
  validateAction,
  type IssueFields,
} from "./actions";
import { IssueMaker } from "./IssueMaker";
import { Btn, FieldsEditor } from "./ui";

type SortKey = "created" | "series" | "area" | "v5";

const SORT_LABEL: Record<SortKey, string> = {
  created: "만든 날",
  series: "계열",
  area: "영역",
  v5: "V5 관심",
};

/** 한 번에 검증하는 질문 수. Europe PMC 가 동시 요청에 503 을 주므로 2개씩 부른다. */
const VALIDATE_CONCURRENCY = 2;

const OPEN = new Set(["cc0", "cc by", "cc-by", "public domain", "pd"]);

export function QuestionBoard({ questions }: { questions: Question[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | "all" | "open">("open");
  const [seedFilter, setSeedFilter] = useState<SeedKind | "all">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("created");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [branch, setBranch] = useState<ProposeBranch>("editorial");
  const [makerOpen, setMakerOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const shown = useMemo(() => {
    const list = questions.filter((q) => {
      if (statusFilter === "open" && !["proposed", "validated", "held"].includes(q.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && q.status !== statusFilter) return false;
      if (seedFilter !== "all" && q.seedKind !== seedFilter) return false;
      if (areaFilter !== "all" && (q.area ?? "") !== areaFilter) return false;
      return true;
    });
    const by = (a: string | null, b: string | null) => (a ?? "힣").localeCompare(b ?? "힣", "ko");
    return [...list].sort((a, b) => {
      if (sort === "series") return by(a.series, b.series) || b.createdAt.localeCompare(a.createdAt);
      if (sort === "area") return by(a.area, b.area) || b.createdAt.localeCompare(a.createdAt);
      if (sort === "v5") return (b.v5WikiEn ?? -1) - (a.v5WikiEn ?? -1);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [questions, statusFilter, seedFilter, areaFilter, sort]);

  const note = (id: string, text: string) => setNotes((n) => ({ ...n, [id]: text }));

  function propose() {
    setBanner(null);
    startTransition(async () => {
      const r = await proposeAction(branch);
      if (!r.ok) setBanner(`제안 실패 · ${r.error}`);
      else
        setBanner(
          `${SEED_LABEL[branch]} 제안 ${r.inserted}개를 넣었습니다 (${(r.ms / 1000).toFixed(1)}초 · 제외 목록 ${r.excluded}개).` +
            (r.skipped.length ? ` 같은 문장이 있어 뺀 것 ${r.skipped.length}개: ${r.skipped.join(" / ")}` : ""),
        );
      setStatusFilter("open");
      router.refresh();
    });
  }

  async function validateOne(id: string) {
    setRunning((s) => new Set(s).add(id));
    note(id, "검증 중…");
    const r = await validateAction(id);
    if (!r.ok) note(id, `검증 실패 · ${r.error}`);
    else {
      const v = r.result;
      note(
        id,
        `${v.ok ? "통과" : `보류 · ${v.failure}`}${v.rewritten ? " · 검색어를 다시 썼습니다" : ""} · ` +
          `${(v.ms.total / 1000).toFixed(1)}초 (Europe PMC ${v.epmcCalls}회 ${(v.ms.epmc / 1000).toFixed(1)}초 · LLM ${v.llmCalls}회 ${(v.ms.llm / 1000).toFixed(1)}초 · 위키·MedlinePlus ${(v.ms.signals / 1000).toFixed(1)}초)`,
      );
    }
    setRunning((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  async function validateMany(ids: string[]) {
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        await validateOne(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(VALIDATE_CONCURRENCY, ids.length) }, worker));
    setSelected(new Set());
    router.refresh();
  }

  function setStatus(id: string, to: "adopted" | "rejected" | "held") {
    startTransition(async () => {
      const r = await setStatusAction(id, to);
      note(id, r.error ? `실패 · ${r.error}` : `${STATUS_LABEL[to]}(으)로 바꿨습니다`);
      router.refresh();
    });
  }

  function saveEdit(id: string, f: IssueFields) {
    startTransition(async () => {
      const r = await editQuestionAction(id, f);
      note(id, r.error ? `고치기 실패 · ${r.error}` : "고쳤습니다");
      if (!r.error) setEditing(null);
      router.refresh();
    });
  }

  /** 같은 문장의 이슈로 옮겨 간다. 필터에 가려지지 않게 모두 푼다. */
  function goTo(id: string) {
    setStatusFilter("all");
    setSeedFilter("all");
    setAreaFilter("all");
    setFocusId(id);
    setTimeout(() => document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  const busy = pending || running.size > 0;
  const selectable = (q: Question) => ["proposed", "validated", "held"].includes(q.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMakerOpen((v) => !v)}
          className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-background"
        >
          이슈 만들기
        </button>
        <span className="mx-1 h-5 w-px bg-[color:var(--border)]" />
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value as ProposeBranch)}
          className="rounded-md border border-[color:var(--border)] bg-background px-2 py-2 text-sm"
          aria-label="제안 갈래"
        >
          <option value="editorial">S1 편집</option>
          <option value="hypothesis">S2 과거 가설</option>
          <option value="review_title">S3 리뷰 제목</option>
        </select>
        <button
          type="button"
          onClick={propose}
          disabled={busy}
          className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-40"
        >
          {pending ? "처리 중…" : "새 이슈 10개 제안"}
        </button>
        <button
          type="button"
          onClick={() => validateMany([...selected])}
          disabled={busy || selected.size === 0}
          className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-40"
        >
          고른 {selected.size}개 검증
        </button>
      </div>

      {makerOpen && (
        <IssueMaker
          onSaved={(id) => {
            setMakerOpen(false);
            router.refresh();
            goTo(id);
          }}
          onDuplicate={(id) => {
            setMakerOpen(false);
            goTo(id);
          }}
        />
      )}

      {banner && (
        <p className="rounded-lg border border-[color:var(--border)]/70 bg-surface/40 p-3 text-sm">{banner}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Filter label="상태" value={statusFilter} onChange={(v) => setStatusFilter(v as never)}>
          <option value="open">고를 것(제안 · 통과 · 보류)</option>
          <option value="all">전부</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Filter>
        <Filter label="갈래" value={seedFilter} onChange={(v) => setSeedFilter(v as never)}>
          <option value="all">전부</option>
          {Object.entries(SEED_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Filter>
        <Filter label="영역" value={areaFilter} onChange={setAreaFilter}>
          <option value="all">전부</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          <option value="">영역 없음</option>
        </Filter>
        <Filter label="정렬" value={sort} onChange={(v) => setSort(v as SortKey)}>
          {Object.entries(SORT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Filter>
        <span>{shown.length}개</span>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-10 text-center">
          <p className="text-sm text-muted-foreground">이슈가 없습니다.</p>
          <button
            type="button"
            onClick={() => setMakerOpen(true)}
            className="mt-4 rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-background"
          >
            이슈 만들기
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-6 text-center text-sm text-muted-foreground">
          조건에 맞는 이슈가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((q) => (
            <li
              key={q.id}
              id={`q-${q.id}`}
              className={`rounded-xl border p-5 ${
                focusId === q.id
                  ? "border-[color:var(--accent)] bg-surface/60"
                  : "border-[color:var(--border)]/70 bg-surface/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  disabled={!selectable(q) || busy}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(q.id)) n.delete(q.id);
                      else n.add(q.id);
                      return n;
                    })
                  }
                  className="mt-1 size-4 shrink-0 accent-[color:var(--accent)]"
                  aria-label={`${q.question} 고르기`}
                />
                <div className="min-w-0 flex-1">
                  {editing === q.id ? (
                    <EditForm q={q} onCancel={() => setEditing(null)} onSave={(f) => saveEdit(q.id, f)} busy={busy} />
                  ) : (
                    <Card q={q} />
                  )}

                  {notes[q.id] && <p className="mt-2 text-xs text-foreground/80">{notes[q.id]}</p>}

                  {selectable(q) && editing !== q.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn onClick={() => validateMany([q.id])} disabled={busy || running.has(q.id)}>
                        {running.has(q.id) ? "검증 중…" : "검증"}
                      </Btn>
                      <Btn onClick={() => setStatus(q.id, "adopted")} disabled={busy || !canAdopt(q)} accent>
                        채택
                      </Btn>
                      <Btn onClick={() => setStatus(q.id, "rejected")} disabled={busy}>
                        기각
                      </Btn>
                      {q.status !== "held" && (
                        <Btn onClick={() => setStatus(q.id, "held")} disabled={busy}>
                          보류
                        </Btn>
                      )}
                      <Btn onClick={() => setEditing(q.id)} disabled={busy}>
                        고치기
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({ q }: { q: Question }) {
  const curve = q.seedKind === "hypothesis" ? curveLine(q.v4ByYear) : null;
  const v3Paper = q.v2Reasons?.find((r) => r.relevant && OPEN.has((r.license ?? "").toLowerCase()));

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium text-foreground">{q.question}</h3>
        <span className="shrink-0 rounded border border-[color:var(--border)] px-1.5 py-0.5 text-xs text-muted-foreground">
          {STATUS_LABEL[q.status]}
        </span>
      </div>

      {/* 역설 줄은 제목과 같은 글자색이다(16차). 통설 → 되묻기 */}
      {(q.premise || q.twist) && (
        <p className="mt-2 text-sm text-foreground">
          통설 · {q.premise ?? "—"}
          <br />
          되묻기 · {q.twist ?? "—"}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {SEED_LABEL[q.seedKind]}
        {q.createdVia && q.seedKind === "owner" ? `(${CREATED_VIA_LABEL[q.createdVia]})` : ""} · 계열 {q.series ?? "—"} · 영역{" "}
        {q.area ?? "—"} · {q.createdAt.slice(0, 10)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{validationLine(q)}</p>
      {curve && <p className="mt-1 text-xs text-muted-foreground">20년 곡선 · {curve}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        증거 칸 {q.slotsFilled}/4
        {q.slotsFilled === 0 && (v3Paper ? ` · V3 논문 1편: ${v3Paper.title}` : q.v3EvidenceOk ? " · V3 논문 있음(9/28 실측)" : "")}
      </p>

      {q.searchQueries.length > 0 && (
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/80">
          {q.searchQueries.join("  /  ")}
        </p>
      )}
      {q.sourceInput && <p className="mt-1 text-xs text-muted-foreground">원래 입력 · {q.sourceInput}</p>}
      {q.memo && <p className="mt-1 text-xs text-muted-foreground">메모 · {q.memo}</p>}

      {q.v2Reasons && q.v2Reasons.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">V2 근거 {q.v2Reasons.length}편</summary>
          <ul className="mt-1 space-y-1">
            {q.v2Reasons.map((r) => (
              <li key={r.id} className="text-muted-foreground">
                <span className={r.relevant ? "text-emerald-300" : "text-red-300"}>{r.relevant ? "관련" : "무관"}</span>{" "}
                · {r.year ?? "—"} · {r.license ?? "라이선스 없음"} ·{" "}
                <a
                  href={`https://europepmc.org/article/${r.id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  {r.title}
                </a>{" "}
                — {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function EditForm({
  q,
  onSave,
  onCancel,
  busy,
}: {
  q: Question;
  onSave: (f: IssueFields) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [f, setF] = useState<IssueFields>({
    question: q.question,
    premise: q.premise ?? "",
    twist: q.twist ?? "",
    series: q.series ?? "",
    area: q.area ?? "",
    queries: [q.searchQueries[0] ?? "", q.searchQueries[1] ?? ""],
  });
  return (
    <div className="space-y-2">
      <FieldsEditor value={f} onChange={setF} />
      <div className="flex gap-2">
        <Btn onClick={() => onSave(f)} disabled={busy} accent>
          저장
        </Btn>
        <Btn onClick={onCancel} disabled={busy}>
          취소
        </Btn>
      </div>
      <p className="text-xs text-muted-foreground">검색어를 바꾸면 검증을 다시 받아야 합니다.</p>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[color:var(--border)] bg-background px-2 py-1 text-xs text-foreground"
      >
        {children}
      </select>
    </label>
  );
}
