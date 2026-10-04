"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import {
  checkFields,
  fillFromInput,
  proposeAndInsert,
  saveIssue,
  suggestEmptyFields,
  suggestQueriesForHeld,
  type FillResult,
  type IssueFields,
  type ProposeResult,
  type SaveResult,
} from "@/lib/dominance/question-actions";
import type { FillMode, ProposeBranch } from "@/lib/dominance/question-llm";
import {
  findSameQuestion,
  loadQuestion,
  updateQuestion,
  type Area,
  type Suggested,
} from "@/lib/dominance/questions";
import { validateQuestion, type ValidationResult } from "@/lib/dominance/validate";

export type { IssueFields } from "@/lib/dominance/question-actions";

const PATH = "/dominance/questions";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── ⓪-1 [새 이슈 10개 제안] ────────────────────────────────────────────────

export async function proposeAction(branch: ProposeBranch): Promise<ProposeResult> {
  const { db } = await dominanceContext();
  const r = await proposeAndInsert(db, branch);
  revalidatePath(PATH);
  return r;
}

// ── [이슈 만들기] [채우기] · [저장] ─────────────────────────────────────────

export async function fillAction(input: {
  mode: FillMode;
  text: string;
  manualTitle?: string;
}): Promise<FillResult> {
  await dominanceContext();
  return fillFromInput(input);
}

/** 36차 C · ⓪-0 Needs 지도의 신호 하나 */
export type IssueSignal = { src: string; title: string; views: number; delta: number | null; week: string };

export async function saveIssueAction(input: {
  mode: FillMode;
  text: string;
  linkTitle: string | null;
  fields: IssueFields;
  signal?: IssueSignal | null;
}): Promise<SaveResult> {
  const { db } = await dominanceContext();
  const r = await saveIssue(db, input);
  if (r.ok) revalidatePath(PATH);
  return r;
}

// ── 카드 고치기 ────────────────────────────────────────────────────────────

export async function editQuestionAction(id: string, f: IssueFields): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  const bad = checkFields(f);
  if (bad) return { error: bad };
  const q = await loadQuestion(db, id);
  if (!q) return { error: "질문을 찾지 못했습니다" };
  if (!["proposed", "validated", "held"].includes(q.status)) {
    return { error: "채택 이후의 질문은 여기서 고치지 않습니다" };
  }
  const same = await findSameQuestion(db, f.question);
  if (same && same.id !== id) return { error: "같은 문장의 이슈가 이미 있습니다" };

  const queries = f.queries.map((s) => s.trim()).filter(Boolean);
  const queriesChanged = queries.join("\n") !== q.searchQueries.join("\n");
  const { error } = await updateQuestion(
    db,
    id,
    {
      question: f.question.trim(),
      premise: f.premise.trim() || null,
      twist: f.twist.trim() || null,
      series: f.series.trim() || null,
      search_queries: queries,
      // 검색어가 바뀌면 검증을 다시 받아야 한다.
      ...(queriesChanged && q.status === "validated" ? { status: "proposed" } : {}),
    },
    // 저장하면 "제안" 표시는 지운다.
    { area: (f.area as Area) || null, suggested: null },
  );
  revalidatePath(PATH);
  return { error };
}

// ── 48차 B · 보류 카드의 [검색어 제안 받기] ──────────────────────────────────

export async function suggestQueriesAction(
  id: string,
): Promise<{ ok: true; queries: string[]; ms: number } | { ok: false; error: string }> {
  const { db } = await dominanceContext();
  try {
    const r = await suggestQueriesForHeld(db, id);
    revalidatePath(PATH);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ── [빈 칸 채우기] ─────────────────────────────────────────────────────────

export async function suggestFillAction(
  id: string,
): Promise<{ ok: true; suggested: Suggested; ms: number } | { ok: false; error: string }> {
  const { db } = await dominanceContext();
  try {
    const r = await suggestEmptyFields(db, id);
    revalidatePath(PATH);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ── ⓪-2 [검증] ─────────────────────────────────────────────────────────────

export type ValidateActionResult =
  | { ok: true; result: ValidationResult }
  | { ok: false; error: string };

export async function validateAction(id: string): Promise<ValidateActionResult> {
  const { db } = await dominanceContext();
  try {
    const result = await validateQuestion(db, id);
    revalidatePath(PATH);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ── ⓪-3 [채택] [기각] [보류] ──────────────────────────────────────────────

export async function setStatusAction(
  id: string,
  to: "adopted" | "rejected" | "held",
): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  const q = await loadQuestion(db, id);
  if (!q) return { error: "질문을 찾지 못했습니다" };
  if (!["proposed", "validated", "held"].includes(q.status)) {
    return { error: "채택 이후의 질문은 상태를 바꾸지 않습니다" };
  }
  // 넘지 않는 선 7: 검증을 통과하지 않은 질문은 채택하지 않는다. DB 제약도 같은 것을 막는다.
  if (to === "adopted" && !(q.status === "validated" && q.v3EvidenceOk)) {
    return { error: "검증을 통과한 질문만 채택할 수 있습니다" };
  }

  const { error } = await updateQuestion(
    db,
    id,
    { status: to, ...(to === "adopted" ? { adopted_at: new Date().toISOString() } : {}) },
    {},
  );
  revalidatePath(PATH);
  return { error };
}
