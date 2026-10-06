"use server";

import { meaningStatus, type MeaningStatus } from "@/lib/dominance/card";
import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { readVoteCandidates, writeVoteCandidates, type VoteCandidate } from "@/lib/dominance/draft-store";
import { approveLetterCore, recheckLetterLinks } from "@/lib/dominance/approve";

function revalidateAll() {
  revalidatePath("/dominance/schedule");
  revalidatePath("/dominance/review");
  revalidatePath("/dominance/letters");
  revalidatePath("/dominance");
}

/** 승인 창을 열 때 원천 링크를 한 번 더 확인한다. 죽은 링크가 있으면 승인을 막는다. */
export async function recheckLinks(
  letterId: string,
): Promise<{ ok: boolean; detail: string; checkedAt: string }> {
  const { db } = await dominanceContext();
  return recheckLetterLinks(db, letterId);
}

/** 45차 C · 승인 창의 셋째 칸(쓰인 문장 뜻 확인 수) */
export async function checkMeanings(letterId: string): Promise<MeaningStatus> {
  const { db } = await dominanceContext();
  return meaningStatus(db, letterId);
}

/** [승인하고 날짜 확정] · 여기를 지나면 크론이 그날 07시에 내보낸다. 검사와 기록은 approve.ts(56차 B · 크론과 같은 몸통). */
export async function approveLetter(
  letterId: string,
  date: string,
): Promise<{ error: string | null; warning: string | null }> {
  const { admin, db } = await dominanceContext();
  const r = await approveLetterCore(db, letterId, date, { by: admin.email, event: "approve", note: `${admin.email}: 승인 창` });
  if (!r.error) revalidateAll();
  return { error: r.error, warning: r.warning };
}

/** [승인 취소] · 발행 전이면 언제든 되돌린다. 리뷰 통과 상태로 돌아간다. */
export async function unapproveLetter(
  letterId: string,
): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();

  const now = new Date().toISOString();
  const { error } = await db
    .from("ds_letters")
    .update({
      status: "reviewed",
      scheduled_for: null,
      approved_at: null,
      approved_by: null,
      updated_at: now,
    })
    .eq("id", letterId)
    .eq("status", "approved");

  if (error) return { error: error.message };

  revalidateAll();
  return { error: null };
}

/** 다음 질문 투표 후보 고르기(26차 C-3) · validated 질문 목록과 이미 고른 것 */
export async function loadVoteChoices(
  letterId: string,
): Promise<{ options: VoteCandidate[]; picked: string[] }> {
  const { db } = await dominanceContext();
  const { data: letter } = await db.from("ds_letters").select("question_id").eq("id", letterId).maybeSingle<{ question_id: string | null }>();
  const { data } = await db
    .from("ds_questions")
    .select("id, question")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(100);
  const options = ((data ?? []) as VoteCandidate[]).filter((q) => q.id !== letter?.question_id);
  const picked = (await readVoteCandidates(db, letterId)).map((c) => c.id);
  return { options, picked };
}

export async function saveVoteChoices(letterId: string, ids: string[]): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  if (ids.length > 3) return { error: "후보는 3개까지입니다." };
  const { data } = await db.from("ds_questions").select("id, question, status").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const rows = (data ?? []) as (VoteCandidate & { status: string })[];
  if (rows.some((r) => r.status !== "validated") || rows.length !== ids.length) return { error: "검증 통과(validated) 질문만 고를 수 있습니다." };
  try {
    await writeVoteCandidates(db, letterId, ids.map((id) => rows.find((r) => r.id === id)!).map(({ id, question }) => ({ id, question })));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return { error: null };
}
