// 38차 D · 편집본을 콘솔 글로 올릴 때 그 글의 질문을 「초안 있음」(drafted)으로 함께 옮긴다(런북 6).
//
// 글이 있는데 질문이 「검증 통과」 에 머물면 증거 표 · ① 이슈 화면이 실제 상태와 어긋난다.
// DB 규칙(ds_questions_adopted_needs_validation)상 drafted 는 채택 시각이 있어야 한다.
// 채택 시각이 비었으면 글이 만들어진 시각으로 채운다(38차 지시). 발행된 질문은 건드리지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type QuestionSync = { questionId: string | null; before: string | null; after: string | null; adoptedAt: string | null };

export async function markQuestionDrafted(db: SupabaseClient, letterId: string): Promise<QuestionSync> {
  const { data: letter } = await db.from("ds_letters").select("question_id, created_at").eq("id", letterId).single();
  const questionId = (letter?.question_id as string | null) ?? null;
  if (!questionId) return { questionId: null, before: null, after: null, adoptedAt: null };
  const { data: q } = await db.from("ds_questions").select("status, adopted_at").eq("id", questionId).single();
  const before = (q?.status as string | null) ?? null;
  if (!q || !["validated", "adopted"].includes(before ?? "")) return { questionId, before, after: before, adoptedAt: (q?.adopted_at as string | null) ?? null };
  const adoptedAt = (q.adopted_at as string | null) ?? (letter!.created_at as string);
  const { error } = await db
    .from("ds_questions")
    .update({ status: "drafted", adopted_at: adoptedAt })
    .eq("id", questionId)
    .eq("status", before!);
  if (error) throw new Error(`질문 상태를 바꾸지 못했습니다: ${error.message}`);
  return { questionId, before, after: "drafted", adoptedAt };
}
