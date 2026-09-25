"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { draftLetterFromCandidate, type DraftOutcome } from "@/lib/dominance/letters";

export type DraftActionResult = {
  outcomes: DraftOutcome[];
};

/** ② [글 작성하기] · 고른 후보마다 초안을 만든다. 한 건이 실패해도 나머지를 계속한다. */
export async function draftSelected(
  candidateIds: string[],
): Promise<DraftActionResult> {
  const { db } = await dominanceContext();

  const outcomes: DraftOutcome[] = [];
  // 직렬로 돈다. z.ai 동시 호출을 늘리면 속도보다 거절이 먼저 온다.
  for (const id of candidateIds) {
    outcomes.push(await draftLetterFromCandidate(db, id));
  }

  revalidatePath("/dominance/candidates");
  revalidatePath("/dominance/letters");
  revalidatePath("/dominance");
  return { outcomes };
}

/** 후보 제외 · 같은 원천이 다시 올라오지 않게 사유를 남긴다. */
export async function excludeCandidate(candidateId: string, reason: string) {
  const { db } = await dominanceContext();

  const { error } = await db
    .from("ds_candidates")
    .update({ state: "excluded", excluded_reason: reason.trim() || "사람이 제외" })
    .eq("id", candidateId);

  revalidatePath("/dominance/candidates");
  return { error: error?.message ?? null };
}
