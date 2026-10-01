"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { setReplies } from "@/lib/dominance/reactions";

/** 답장 수 · 운영자가 받은편지함을 보고 손으로 적는다(26차 C-3). */
export async function saveRepliesAction(letterId: string, replies: number): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  if (!Number.isFinite(replies) || replies < 0) return { error: "0 이상의 수를 적어 주십시오." };
  try {
    await setReplies(db, letterId, replies);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/dominance/reactions");
  return { error: null };
}
