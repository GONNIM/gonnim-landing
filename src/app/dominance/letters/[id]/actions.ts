"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { countFlags, flagBlocks } from "@/lib/dominance/filters";
import { saveLetterBody } from "@/lib/dominance/letters";
import type { GlossaryItem } from "@/lib/dominance/draft-card";
import { normalizePunct, tagsIn } from "@/lib/dominance/tags";
import { numberMismatchesFor } from "@/lib/dominance/card";
import type { NumberMismatch } from "@/lib/dominance/card-check";
import { readDraftMeta, writeDraftMeta } from "@/lib/dominance/draft-store";
import type { LetterBlock } from "@/lib/dominance/types";

type Db = Awaited<ReturnType<typeof dominanceContext>>["db"];

/**
 * 질문에서 나온 글(20차)은 블록의 출처를 본문의 인라인 태그로 다시 센다. 사람이 문장을 고치면 태그도 따라 바뀐다.
 * 옛 후보 경로의 글은 태그가 없으므로 그대로 둔다.
 */
async function withTagSources(db: Db, letterId: string, blocks: LetterBlock[]): Promise<LetterBlock[]> {
  const { data } = await db.from("ds_letters").select("question_id").eq("id", letterId).maybeSingle<{ question_id: string | null }>();
  if (!data?.question_id) return blocks;
  return blocks.map((b) => {
    // 24차 B-2 · 전각 마침표 · 물음표를 반각으로
    const text = normalizePunct(b.text);
    const tags = tagsIn(text);
    return { ...b, text, sourceIds: tags.length ? tags : undefined };
  });
}

async function questionOf(db: Db, letterId: string): Promise<string | null> {
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
export async function saveLetter(
  letterId: string,
  patch: { title: string; summary: string; blocks: LetterBlock[] },
): Promise<SaveResult> {
  const { db } = await dominanceContext();

  const blocks = flagBlocks(await withTagSources(db, letterId, patch.blocks));
  const { error } = await saveLetterBody(db, letterId, {
    title: patch.title,
    summary: patch.summary,
    blocks,
  });

  return {
    blocks,
    mismatches: await numberMismatchesFor(db, await questionOf(db, letterId), blocks),
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

  const blocks = flagBlocks(await withTagSources(db, letterId, patch.blocks));
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

/** 용어표를 고친다. 본문은 자동으로 바뀌지 않는다(사람이 고친다 · 20차 B-4). */
export async function saveGlossary(letterId: string, glossary: GlossaryItem[]): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  const meta = await readDraftMeta(db, letterId);
  if (!meta) return { error: "이 글에는 용어표 파일이 없습니다" };
  try {
    await writeDraftMeta(db, letterId, { ...meta, glossary: glossary.filter((g) => g.plain.trim()) });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
