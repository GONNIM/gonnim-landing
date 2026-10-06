"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton, type RunResult, type StepFn } from "../_ui/ActionButton";
import { useActionStatus } from "../_ui/ActionStatus";
import { STAGES } from "../_ui/Progress";
import type { EvidenceRun } from "@/lib/dominance/collect-types";
import {
  AREAS,
  CREATED_VIA_LABEL,
  SEED_LABEL,
  STATUS_LABEL,
  STATUS_NEXT,
  canAdopt,
  holdNext,
  holdReason,
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
  suggestFillAction,
  suggestQueriesAction,
  validateAction,
  type IssueFields,
} from "./actions";
import { runCollect } from "./runCollect";
import { IssueMaker } from "./IssueMaker";
import type { IssueSignal } from "./actions";
import { Btn, FieldsEditor } from "./ui";

type SortKey = "area" | "series" | "v5" | "created";

// 영역이 먼저다. 계열은 선택 항목이다(19차 B-2).
const SORT_LABEL: Record<SortKey, string> = {
  area: "영역",
  series: "계열",
  v5: "V5 관심",
  created: "만든 날",
};

/** 한 번에 검증하는 질문 수. Europe PMC 가 동시 요청에 503 을 주므로 2개씩 부른다. */
const VALIDATE_CONCURRENCY = 2;

const TOP_BTN = "rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-40";

const OPEN = new Set(["cc0", "cc by", "cc-by", "public domain", "pd"]);

export function QuestionBoard({ questions, signal = null }: { questions: Question[]; signal?: IssueSignal | null }) {
  const router = useRouter();
  const { busy: actionBusy, toast } = useActionStatus();
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | "all" | "open">("open");
  const [seedFilter, setSeedFilter] = useState<SeedKind | "all">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("area");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [branch, setBranch] = useState<ProposeBranch>("editorial");
  // 36차 C · 신호를 받고 들어오면 이슈 만들기 칸을 연 채로 시작한다
  const [makerOpen, setMakerOpen] = useState(!!signal);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const shown = useMemo(() => {
    const list = questions.filter((q) => {
      // 42차 C · 글을 쓰는 중인 질문(초안 있음)도 기본 목록에 보인다. 뜻 확인 · 판정 때 「전부」로 바꾸지 않아도 된다.
      if (statusFilter === "open" && !["proposed", "validated", "held", "drafted"].includes(q.status)) return false;
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

  // 56차 C · 처리 함수는 결과 글자를 돌려준다. ActionButton 이 그 글자를 알림 띠로 낸다. 카드 아래 글자(note)는 그대로 둔다.
  async function propose(): Promise<RunResult> {
    setBanner(null);
    const r = await proposeAction(branch);
    const text = !r.ok
      ? `제안 실패 · ${r.error}`
      : `${SEED_LABEL[branch]} 제안 ${r.inserted}개를 넣었습니다 (${(r.ms / 1000).toFixed(1)}초 · 제외 목록 ${r.excluded}개).` +
        (r.skipped.length ? ` 같은 문장이 있어 뺀 것 ${r.skipped.length}개: ${r.skipped.join(" / ")}` : "");
    setBanner(text);
    setStatusFilter("open");
    router.refresh();
    return { ok: r.ok, text };
  }

  async function validateOne(id: string): Promise<{ ok: boolean; passed: boolean; text: string }> {
    setRunning((s) => new Set(s).add(id));
    note(id, "검증 중…");
    const r = await validateAction(id);
    let out: { ok: boolean; passed: boolean; text: string };
    if (!r.ok) out = { ok: false, passed: false, text: `검증 실패 · ${r.error}` };
    else {
      const v = r.result;
      out = {
        ok: true,
        passed: v.ok,
        text:
          `${v.ok ? "통과" : `보류 · ${v.failure}`}${v.rewritten ? " · 검색어를 다시 썼습니다" : ""} · ` +
          `${(v.ms.total / 1000).toFixed(1)}초 (Europe PMC ${v.epmcCalls}회 ${(v.ms.epmc / 1000).toFixed(1)}초 · LLM ${v.llmCalls}회 ${(v.ms.llm / 1000).toFixed(1)}초 · 위키·MedlinePlus ${(v.ms.signals / 1000).toFixed(1)}초)`,
      };
    }
    note(id, out.text);
    setRunning((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    return out;
  }

  async function validateMany(ids: string[]): Promise<RunResult> {
    const queue = [...ids];
    const results: { ok: boolean; passed: boolean; text: string }[] = [];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        results.push(await validateOne(id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(VALIDATE_CONCURRENCY, ids.length) }, worker));
    setSelected(new Set());
    router.refresh();
    if (results.length === 1) return { ok: results[0].ok, text: results[0].text };
    const failed = results.filter((x) => !x.ok).length;
    const passed = results.filter((x) => x.passed).length;
    return { ok: failed === 0, text: `${results.length}개 검증 · 통과 ${passed} · 보류 ${results.length - passed - failed}${failed ? ` · 실패 ${failed}` : ""}` };
  }

  async function setStatus(id: string, to: "adopted" | "rejected" | "held", step?: StepFn): Promise<RunResult> {
    const r = await setStatusAction(id, to);
    const text = r.error ? `실패 · ${r.error}` : `${STATUS_LABEL[to]}(으)로 바꿨습니다`;
    note(id, text);
    router.refresh();
    if (r.error) return { ok: false, text };
    // D26 ① · 채택하면 [증거 모으기]가 곧바로 돈다. 실패해도 채택은 그대로다. 단추는 다 모을 때까지 단계를 보인다.
    if (to === "adopted") {
      toast({ ok: true, text });
      return collectAfterAdopt(id, step);
    }
    return { ok: true, text };
  }

  async function collectAfterAdopt(id: string, step?: StepFn): Promise<RunResult> {
    setRunning((s) => new Set(s).add(id));
    const r = await runCollect(id, (t) => note(id, `채택했습니다 · 증거 모으기 ${t}`), step);
    const text = r.error
      ? `채택했습니다 · 증거 모으기 실패(${r.error}). 증거 표에서 다시 누를 수 있습니다`
      : `채택했습니다 · 증거 모으기 끝 · 카드 ${r.run?.total ?? 0}문장`;
    note(id, text);
    setRunning((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    router.refresh();
    return { ok: !r.error, text };
  }

  async function suggest(id: string): Promise<RunResult> {
    note(id, "빈 칸을 채우는 중…");
    const r = await suggestFillAction(id);
    const text = r.ok ? `제안을 받았습니다(${(r.ms / 1000).toFixed(1)}초). [고치기]에서 확인하고 저장하십시오` : `실패 · ${r.error}`;
    note(id, text);
    router.refresh();
    return { ok: r.ok, text };
  }

  // 48차 B · 보류 카드의 [검색어 제안 받기] · suggested 칸에만 저장
  async function suggestQueries(id: string): Promise<RunResult> {
    note(id, "검색어 제안을 받는 중…");
    const r = await suggestQueriesAction(id);
    const text = r.ok ? "검색어 제안을 받았습니다. [고치기]에서 확인하고 저장한 뒤 검증하십시오" : `실패 · ${r.error}`;
    note(id, text);
    router.refresh();
    return { ok: r.ok, text };
  }

  async function saveEdit(id: string, f: IssueFields): Promise<RunResult> {
    const r = await editQuestionAction(id, f);
    const text = r.error ? `고치기 실패 · ${r.error}` : "고쳤습니다";
    note(id, text);
    if (!r.error) setEditing(null);
    router.refresh();
    return { ok: !r.error, text };
  }

  /** 같은 문장의 이슈로 옮겨 간다. 필터에 가려지지 않게 모두 푼다. */
  function goTo(id: string) {
    setStatusFilter("all");
    setSeedFilter("all");
    setAreaFilter("all");
    setFocusId(id);
    setTimeout(() => document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  const busy = actionBusy || running.size > 0;
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
        <ActionButton run={propose} disabled={busy} stages={STAGES.propose} className={TOP_BTN}>
          새 이슈 10개 제안
        </ActionButton>
        <ActionButton
          run={() => validateMany([...selected])}
          disabled={busy || selected.size === 0}
          stages={STAGES.validate}
          className={TOP_BTN}
          pendingText={`${selected.size}개 검증 중…`}
        >
          고른 {selected.size}개 검증
        </ActionButton>
      </div>

      {makerOpen && (
        <IssueMaker
          signal={signal}
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
          <option value="open">고를 것(제안 · 통과 · 보류 · 초안 있음)</option>
          <option value="all">전부</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
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
        <Filter label="갈래" value={seedFilter} onChange={(v) => setSeedFilter(v as never)}>
          <option value="all">전부</option>
          {Object.entries(SEED_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
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
                    <EditForm
                      key={q.suggested?.at ?? "plain"}
                      q={q}
                      onCancel={() => setEditing(null)}
                      onSave={(f) => saveEdit(q.id, f)}
                      busy={busy}
                    />
                  ) : (
                    <Card q={q} />
                  )}

                  {notes[q.id] && <p className="mt-2 text-xs text-foreground/80">{notes[q.id]}</p>}

                  {selectable(q) && editing !== q.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton run={() => validateMany([q.id])} disabled={busy || running.has(q.id)} stages={STAGES.validate} pendingText="검증 중…">
                        검증
                      </ActionButton>
                      <ActionButton
                        run={(step) => setStatus(q.id, "adopted", step)}
                        disabled={busy || !canAdopt(q)}
                        accent
                        title={
                          q.status !== "validated"
                            ? "검증 통과가 아닙니다"
                            : q.v3EvidenceOk !== true
                              ? "V3 논문이 없습니다"
                              : undefined
                        }
                      >
                        채택
                      </ActionButton>
                      <ActionButton run={() => setStatus(q.id, "rejected")} disabled={busy}>
                        기각
                      </ActionButton>
                      {q.status !== "held" && (
                        <ActionButton run={() => setStatus(q.id, "held")} disabled={busy}>
                          보류
                        </ActionButton>
                      )}
                      <Btn onClick={() => setEditing(q.id)} disabled={busy}>
                        고치기
                      </Btn>
                      {q.status === "held" && (
                        <ActionButton run={() => suggestQueries(q.id)} disabled={busy}>
                          검색어 제안 받기
                        </ActionButton>
                      )}
                      {hasEmpty(q) && !q.suggested && (
                        <ActionButton run={() => suggest(q.id)} disabled={busy}>
                          빈 칸 채우기
                        </ActionButton>
                      )}
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
  const run = q.evidenceRun as EvidenceRun | null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium text-foreground">{q.question}</h3>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-xs text-muted-foreground">
            {STATUS_LABEL[q.status]}
          </span>
          {STATUS_NEXT[q.status] && <span className="text-[11px] text-muted-foreground/80">{STATUS_NEXT[q.status]}</span>}
        </span>
      </div>

      {/* 48차 B · D52 · 보류 이유는 저장된 V 값에서 다시 계산해 항상 보인다 */}
      {q.status === "held" && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <p>보류 이유 · {holdReason(q)}</p>
          <p className="mt-0.5">다음 할 일 · {holdNext(q).join(" / ")}</p>
        </div>
      )}

      {/* 역설 줄은 제목과 같은 글자색이다(16차). 통설 → 되묻기 */}
      {(q.premise || q.twist) && (
        <p className="mt-2 text-sm text-foreground">
          통설 · {q.premise ?? "—"}
          <br />
          되묻기 · {q.twist ?? "—"}
        </p>
      )}

      {q.suggested && <SuggestedBlock q={q} />}

      <p className="mt-2 text-xs text-muted-foreground">
        영역 {q.area ?? "없음(필수)"} · {SEED_LABEL[q.seedKind]}
        {q.createdVia && q.seedKind === "owner" ? `(${CREATED_VIA_LABEL[q.createdVia]})` : ""}
        {q.series ? ` · 계열 ${q.series}` : ""} · {q.createdAt.slice(0, 10)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{validationLine(q)}</p>
      {curve && <p className="mt-1 text-xs text-muted-foreground">20년 곡선 · {curve}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        증거 칸 {q.slotsFilled}/4 · 카드 {q.factCount}/22문장
        {q.slotsFilled === 0 && (v3Paper ? ` · V3 논문 1편: ${v3Paper.title}` : q.v3EvidenceOk ? " · V3 논문 있음(9/28 실측)" : "")}
        {(q.slotsFilled > 0 || ["validated", "adopted", "drafted", "published"].includes(q.status)) && (
          <>
            {" · "}
            <Link href={`/dominance/questions/${q.id}/evidence`} className="text-foreground underline">
              증거 표 →
            </Link>
          </>
        )}
      </p>
      {run && (
        <p className="mt-1 text-xs text-muted-foreground">
          증거 모으기 {run.updatedAt.slice(5, 16).replace("T", " ")} · 새 문장 {run.added} · 대조 실패 {run.verifyFailed} ·{" "}
          {(run.phases.reduce((n, p) => n + p.ms, 0) / 1000).toFixed(0)}초 · LLM {run.llmCalls}회
          {run.errors.length ? ` · 오류 ${run.errors.length}` : ""}
        </p>
      )}

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
                <span className={r.relevant ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{r.relevant ? "관련" : "무관"}</span>{" "}
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
  onSave: (f: IssueFields) => Promise<RunResult>;
  onCancel: () => void;
  busy: boolean;
}) {
  // 빈 칸에는 [빈 칸 채우기] 제안을 먼저 넣어 둔다. 저장하기 전까지 "제안" 표시가 붙는다.
  const sg = q.suggested;
  const qs = q.searchQueries.length ? q.searchQueries : (sg?.queries ?? []);
  const [f, setF] = useState<IssueFields>({
    question: q.question,
    premise: q.premise ?? sg?.premise ?? "",
    twist: q.twist ?? sg?.twist ?? "",
    series: q.series ?? sg?.series ?? "",
    area: q.area ?? sg?.area ?? "",
    queries: [qs[0] ?? "", qs[1] ?? ""],
  });
  const marks = {
    premise: !q.premise && !!sg?.premise,
    twist: !q.twist && !!sg?.twist,
    queries: q.searchQueries.length === 0 && !!sg?.queries?.length,
    area: !q.area && !!sg?.area,
  };
  return (
    <div className="space-y-2">
      <FieldsEditor value={f} onChange={setF} marks={marks} />
      <div className="flex gap-2">
        <ActionButton run={() => onSave(f)} disabled={busy} accent>
          저장
        </ActionButton>
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

function hasEmpty(q: Question): boolean {
  return !q.premise || !q.twist || q.searchQueries.length === 0 || !q.area;
}

/** [빈 칸 채우기] 결과 · 저장 전이므로 "제안" 으로 보인다. */
function SuggestedBlock({ q }: { q: Question }) {
  const s = q.suggested!;
  const rows = [
    s.premise && ["통설", s.premise],
    s.twist && ["되묻기", s.twist],
    s.queries?.length && ["검색어", s.queries.join(" / ")],
    s.area && ["영역", s.area],
    s.series && ["계열", s.series],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="mt-2 rounded-lg border border-dashed border-amber-500/50 p-2 text-xs">
      <p className="text-amber-700 dark:text-amber-200">제안 · 아직 저장하지 않았습니다. [고치기]에서 확인하고 저장하십시오.</p>
      {rows.map(([k, v]) => (
        <p key={k} className="mt-0.5 text-foreground/80">
          {k} · {v}
        </p>
      ))}
    </div>
  );
}
