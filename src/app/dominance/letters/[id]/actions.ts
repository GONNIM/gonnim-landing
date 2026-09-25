"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { countFlags, flagBlocks } from "@/lib/dominance/filters";
import { saveLetterBody } from "@/lib/dominance/letters";
import type { LetterBlock } from "@/lib/dominance/types";

export type SaveResult = {
  blocks: LetterBlock[];
  flagCount: number;
  savedAt: string;
  error: string | null;
};

/** 자동 저장과 Cmd+S 가 같이 쓰는 경로. 저장할 때마다 필터를 다시 건다. */
export async function saveLetter(
  letterId: string,
  patch: { title: string; summary: string; blocks: LetterBlock[] },
): Promise<SaveResult> {
  const { db } = await dominanceContext();

  const blocks = flagBlocks(patch.blocks);
  const { error } = await saveLetterBody(db, letterId, {
    title: patch.title,
    summary: patch.summary,
    blocks,
  });

  return {
    blocks,
    flagCount: countFlags(blocks),
    savedAt: new Date().toISOString(),
    error: error?.message ?? null,
  };
}

/** [작성 완료] · status 를 review 로 올린다. "발행해도 되는 글"이 아니라 "다 썼다"는 뜻이다. */
export async function finishWriting(
  letterId: string,
  patch: { title: string; summary: string; blocks: LetterBlock[] },
): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();

  const blocks = flagBlocks(patch.blocks);
  if (countFlags(blocks) > 0) {
    return { error: "거절 필터 경고가 남아 있습니다. 고친 뒤에 올리십시오." };
  }
  const empty = blocks.filter((b) => !b.text.trim());
  if (empty.length > 0) {
    return { error: `빈 블록이 ${empty.length}개 있습니다.` };
  }

  const { error } = await db
    .from("ds_letters")
    .update({
      title: patch.title,
      summary: patch.summary,
      blocks,
      status: "review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", letterId)
    .eq("status", "draft");

  revalidatePath("/dominance/letters");
  revalidatePath("/dominance/review");
  revalidatePath("/dominance");
  return { error: error?.message ?? null };
}
