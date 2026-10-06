"use server";

import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { countFlags, flagBlocks } from "@/lib/dominance/filters";
import type { GlossaryItem } from "@/lib/dominance/draft-card";
import { readDraftMeta, writeDraftMeta } from "@/lib/dominance/draft-store";
import { questionOf, saveLetterCore, withTagSources as withTagSourcesFor, type SaveResult } from "@/lib/dominance/letter-save";
import { timer } from "@/lib/dominance/timing";
import type { LetterBlock } from "@/lib/dominance/types";

type Db = Awaited<ReturnType<typeof dominanceContext>>["db"];

async function withTagSources(db: Db, letterId: string, blocks: LetterBlock[]): Promise<LetterBlock[]> {
  return withTagSourcesFor(await questionOf(db, letterId), blocks);
}

export type { SaveResult };

/** 자동 저장과 Cmd+S 가 같이 쓰는 경로. 몸통은 letter-save.ts(56차 D · 시간 재기 라우트와 같은 함수). */
export async function saveLetter(
  letterId: string,
  patch: { title: string; summary: string; blocks: LetterBlock[] },
): Promise<SaveResult> {
  const t = timer("저장");
  const { db } = await t.step("인증", dominanceContext());
  const r = await saveLetterCore(db, letterId, patch, t);
  t.log();
  return r;
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
