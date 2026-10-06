// 56차 D · ③ 편집 저장의 몸통 · 서버 동작(letters/[id]/actions.ts)과 시간 재기 라우트가 같은 함수를 부른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { countFlags, flagBlocks } from "./filters";
import { saveLetterBody } from "./letters";
import { normalizePunct, tagsIn } from "./tags";
import { loadQuestionCard, numberMismatchesFor } from "./card";
import type { NumberMismatch } from "./card-check";
import { readDraftMeta } from "./draft-store";
import type { LetterBlock } from "./types";
import { noTimer, type Timer } from "./timing";

/**
 * 질문에서 나온 글(20차)은 블록의 출처를 본문의 인라인 태그로 다시 센다. 사람이 문장을 고치면 태그도 따라 바뀐다.
 * 옛 후보 경로의 글은 태그가 없으므로 그대로 둔다.
 */
export function withTagSources(questionId: string | null, blocks: LetterBlock[]): LetterBlock[] {
  if (!questionId) return blocks;
  return blocks.map((b) => {
    // 24차 B-2 · 전각 마침표 · 물음표를 반각으로
    const text = normalizePunct(b.text);
    const tags = tagsIn(text);
    return { ...b, text, sourceIds: tags.length ? tags : undefined };
  });
}

export async function questionOf(db: SupabaseClient, letterId: string): Promise<string | null> {
  const { data } = await db.from("ds_letters").select("question_id").eq("id", letterId).maybeSingle<{ question_id: string | null }>();
  return data?.question_id ?? null;
}

export type SaveResult = {
  blocks: LetterBlock[];
  /** 카드 수치 대조에서 어긋난 문장(24차 A-6) · 저장은 막지 않는다 */
  mismatches: NumberMismatch[];
  flagCount: number;
  savedAt: string;
  error: string | null;
};

/** 자동 저장과 Cmd+S 가 같이 쓰는 경로. 저장할 때마다 필터를 다시 건다. */
export async function saveLetterCore(
  db: SupabaseClient,
  letterId: string,
  patch: { title: string; summary: string; blocks: LetterBlock[] },
  t: Timer = noTimer,
): Promise<SaveResult> {
  const questionId = await t.step("질문 id", questionOf(db, letterId));
  const blocks = flagBlocks(withTagSources(questionId, patch.blocks));
  // 56차 D · 저장 · 메타 · 카드를 동시에(전에는 질문 id 를 두 번 읽고 차례로 기다렸다)
  const [{ error }, meta, card] = await Promise.all([
    t.step("본문 저장", saveLetterBody(db, letterId, { title: patch.title, summary: patch.summary, blocks })),
    t.step("메타 파일", readDraftMeta(db, letterId)),
    questionId ? t.step("사실 카드", loadQuestionCard(db, questionId)) : Promise.resolve(null),
  ]);
  // 29차 B-2 · 용어표 괄호 풀이의 숫자는 대조에서 뺀다
  const mismatches = await t.step("카드 수치 대조", numberMismatchesFor(db, questionId, blocks, meta?.glossary ?? [], card));
  return { blocks, mismatches, flagCount: countFlags(blocks), savedAt: new Date().toISOString(), error: error?.message ?? null };
}
