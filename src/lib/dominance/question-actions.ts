// ① 이슈 고르기의 쓰기 동작 · 서버 액션(app/dominance/questions/actions.ts)이 부른다.
//
// 인증은 액션이 먼저 확인한다(guard.ts). 여기 함수는 DB 클라이언트를 받아 일만 한다.
// 검증 스크립트도 같은 함수를 부르므로, 화면과 시험이 같은 길을 지난다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readLinkTitle } from "./link-title";
import {
  fillIssue,
  proposeQuestions,
  type FillMode,
  type Filled,
  type ProposeBranch,
} from "./question-llm";
import {
  AREAS,
  findSameQuestion,
  insertQuestion,
  normalizeQuestion,
  type Area,
} from "./questions";
import { recentReviewTitles } from "./validate";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── ⓪-1 [새 이슈 10개 제안] ────────────────────────────────────────────────

export type ProposeResult =
  | { ok: true; inserted: number; skipped: string[]; ms: number; excluded: number }
  | { ok: false; error: string };

export async function proposeAndInsert(
  db: SupabaseClient,
  branch: ProposeBranch,
): Promise<ProposeResult> {
  const t0 = Date.now();
  try {
    const { data } = await db
      .from("ds_questions")
      .select("question, status")
      .in("status", ["adopted", "rejected", "held", "drafted", "published"]);
    const exclude = ((data ?? []) as { question: string }[]).map((r) => r.question);

    const reviewTitles = branch === "review_title" ? await recentReviewTitles() : undefined;
    const items = await proposeQuestions({ branch, exclude, reviewTitles });

    let inserted = 0;
    const skipped: string[] = [];
    for (const it of items) {
      // 제외 목록이나 이미 있는 질문과 문장이 같으면 넣지 않는다.
      if (await findSameQuestion(db, it.question)) {
        skipped.push(it.question);
        continue;
      }
      const { error } = await insertQuestion(
        db,
        {
          question: it.question,
          premise: it.premise || null,
          twist: it.twist || null,
          series: it.series || null,
          searchQueries: it.queries,
          seedKind: branch,
          memo: it.memo,
        },
        { area: it.area, created_via: "llm" },
      );
      if (error) skipped.push(`${it.question} (${error})`);
      else inserted++;
    }

    return { ok: true, inserted, skipped, ms: Date.now() - t0, excluded: exclude.length };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ── [이슈 만들기] [채우기] ─────────────────────────────────────────────────

export type FillResult =
  | { ok: true; filled: Filled; linkTitle: string | null; ms: number }
  | { ok: false; error: string; needTitle?: boolean };

export async function fillFromInput(input: {
  mode: FillMode;
  text: string;
  /** 링크 제목을 읽지 못했을 때 운영자가 적은 제목 */
  manualTitle?: string;
}): Promise<FillResult> {
  const t0 = Date.now();
  const text = input.text.trim();
  if (!text) return { ok: false, error: "입력이 비었습니다" };

  let basis = text;
  let linkTitle: string | null = null;
  if (input.mode === "link") {
    if (input.manualTitle?.trim()) {
      linkTitle = input.manualTitle.trim();
    } else {
      const r = await readLinkTitle(text);
      if (!r.ok) {
        return { ok: false, error: `${r.reason}. 페이지 제목을 직접 적어 주십시오`, needTitle: true };
      }
      linkTitle = r.title;
    }
    basis = linkTitle;
  }

  try {
    const filled = await fillIssue({ mode: input.mode, text: basis });
    return { ok: true, filled, linkTitle, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ── [이슈 만들기] [저장] ───────────────────────────────────────────────────

export type IssueFields = {
  question: string;
  premise: string;
  twist: string;
  series: string;
  area: string;
  queries: string[];
};

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string; duplicateId?: string; duplicateStatus?: string };

export function checkFields(f: IssueFields): string | null {
  if (!normalizeQuestion(f.question)) return "질문 문장이 비었습니다";
  if (f.queries.filter((q) => q.trim()).length === 0) return "검색어가 하나는 있어야 검증할 수 있습니다";
  if (f.area && !(AREAS as readonly string[]).includes(f.area)) return "영역은 10개 중 하나여야 합니다";
  return null;
}

export async function saveIssue(
  db: SupabaseClient,
  input: {
    mode: FillMode;
    text: string;
    linkTitle: string | null;
    fields: IssueFields;
  },
): Promise<SaveResult> {
  const f = input.fields;
  const bad = checkFields(f);
  if (bad) return { ok: false, error: bad };

  const same = await findSameQuestion(db, f.question);
  if (same) {
    return {
      ok: false,
      error: "같은 문장의 이슈가 이미 있습니다. 그 이슈로 옮겨 갑니다",
      duplicateId: same.id,
      duplicateStatus: same.status,
    };
  }

  // 원래 입력을 남긴다. 링크는 주소와 읽은 제목만 둔다(본문 없음).
  const sourceInput =
    input.mode === "link"
      ? `${input.text.trim()}${input.linkTitle ? ` · 제목: ${input.linkTitle}` : ""}`
      : input.text.trim();

  const { id, error } = await insertQuestion(
    db,
    {
      question: f.question.trim(),
      premise: f.premise.trim() || null,
      twist: f.twist.trim() || null,
      series: f.series.trim() || null,
      searchQueries: f.queries.map((q) => q.trim()).filter(Boolean),
      seedKind: "owner",
      memo: null,
    },
    {
      area: (f.area as Area) || null,
      created_via: input.mode,
      source_input: sourceInput,
    },
  );
  if (error || !id) return { ok: false, error: error ?? "저장하지 못했습니다" };
  return { ok: true, id };
}

