"use server";

// 60차 B · 「기록」 상세의 변환 단추. 글의 DB 행은 바꾸지 않고 ds-drafts/<글 id>/convert/ 에 새 판을 더한다.

import { dominanceContext } from "@/lib/dominance/guard";
import { letterPackage } from "@/lib/dominance/letter-package";
import { makeConversion, type ConvertFile, type ConvertKind } from "@/lib/dominance/convert";

export async function convertLetter(letterId: string, kind: ConvertKind): Promise<{ error: string | null; file: ConvertFile | null }> {
  const { db } = await dominanceContext();
  if (kind !== "blog" && kind !== "shorts") return { error: "모르는 변환 종류입니다.", file: null };
  const pkg = await letterPackage(db, letterId);
  if (!pkg) return { error: "글을 찾지 못했습니다.", file: null };
  try {
    return { error: null, file: await makeConversion(db, pkg, kind) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), file: null };
  }
}
