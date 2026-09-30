// ③ [글 작성하기] · 질문의 사실 카드로 초안 글(ds_letters draft)을 만든다 (20차 B-2).
//
// - 채택한 질문이고, 재료 네 칸 중 3칸 이상이 차 있을 때만 연다.
// - 처음이면 글을 만들고 question_id 를 잇는다. 다시 누르면 같은 글에 새 판을 쓴다.
//   revision_count 는 0 을 유지하고(리뷰에서 되돌아온 횟수가 아니다), 이전 판은 ds-drafts 파일로 보관한다.
// - 원천 목록(ds_letter_sources)은 카드의 원천과 [V] 로 다시 만든다. 태그가 본문과 원천을 잇는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { V_TAG, loadQuestionCard, vSearchUrl } from "./card";
import { generateCardDraft } from "./draft-card";
import { archiveDraft, readDraftMeta, writeDraftMeta, type DraftMeta } from "./draft-store";
import { SLOTS, loadEvidence, type SourceRef } from "./evidence";
import { makeSlug } from "./letters";
import type { LetterBlock } from "./types";

export const MIN_SLOTS = 3;

export type DraftGate = { ok: true } | { ok: false; reason: string };

export function draftGate(status: string, filledSlots: number): DraftGate {
  if (!["adopted", "drafted"].includes(status)) return { ok: false, reason: "채택한 질문만 글을 씁니다" };
  if (filledSlots < MIN_SLOTS) return { ok: false, reason: `재료 칸이 ${filledSlots}/4 입니다. ${MIN_SLOTS}칸 이상이어야 합니다` };
  return { ok: true };
}

export type DraftWriteResult = {
  letterId: string;
  created: boolean;
  archivedTo: string | null;
  meta: DraftMeta;
};

function letterSourceRow(letterId: string, tag: string, s: SourceRef) {
  if (s.kind === "paper") return { letter_id: letterId, tag, paper_id: s.paperId };
  if (s.kind === "press") return { letter_id: letterId, tag, gov_press_id: s.pressId };
  return { letter_id: letterId, tag, ext_url: s.extUrl, ext_title: s.title, ext_source_kind: s.extKind, license: s.license };
}

/**
 * 초안을 쓰고 글을 만든다(또는 새 판으로 바꾼다).
 * skipAdoptionCheck 는 검증 스크립트만 쓴다(채택 전 질문으로 시험할 때). 칸 수 확인은 건너뛰지 않는다.
 */
export async function writeDraftFromCard(
  db: SupabaseClient,
  questionId: string,
  opts: { skipAdoptionCheck?: boolean } = {},
): Promise<DraftWriteResult> {
  const card = await loadQuestionCard(db, questionId);
  if (!card) throw new Error("질문을 찾지 못했습니다");
  const gate = draftGate(opts.skipAdoptionCheck ? "adopted" : card.question.status, card.filledSlots);
  if (!gate.ok) throw new Error(gate.reason);
  if (card.facts.length === 0) throw new Error("사실 카드에 문장이 없습니다");

  const { data: existing } = await db
    .from("ds_letters")
    .select("id, title, summary, blocks, status")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; title: string; summary: string | null; blocks: LetterBlock[]; status: string }>();
  if (existing && existing.status !== "draft") {
    throw new Error("이 질문의 글이 이미 리뷰 단계에 있습니다. 새 판을 만들지 않습니다");
  }

  const gen = await generateCardDraft(card);
  const title = gen.titles[0] || card.question.question;

  let letterId: string;
  let archivedTo: string | null = null;
  let generation = 1;
  if (existing) {
    const prevMeta = await readDraftMeta(db, existing.id);
    generation = (prevMeta?.generation ?? 1) + 1;
    archivedTo = await archiveDraft(db, existing.id, {
      title: existing.title,
      summary: existing.summary,
      blocks: existing.blocks,
      meta: prevMeta,
    });
    const { error } = await db
      .from("ds_letters")
      .update({ title, summary: gen.summary, blocks: gen.blocks, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "draft");
    if (error) throw new Error(`새 판을 저장하지 못했습니다: ${error.message}`);
    letterId = existing.id;
  } else {
    const { data, error } = await db
      .from("ds_letters")
      .insert({
        slug: makeSlug(),
        title,
        summary: gen.summary,
        blocks: gen.blocks,
        status: "draft",
        revision_count: 0,
        question_id: questionId,
        candidate_id: null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`글을 만들지 못했습니다: ${error?.message}`);
    letterId = (data as { id: string }).id;
  }

  // 원천 목록 · 카드의 원천 + [V]
  const table = await loadEvidence(db, questionId);
  const byTag = new Map<string, SourceRef>();
  for (const s of SLOTS) for (const g of table.slots[s]) if (g.source.tag && !byTag.has(g.source.tag)) byTag.set(g.source.tag, g.source);
  const rows: Record<string, unknown>[] = [...byTag.entries()].map(([tag, s]) => letterSourceRow(letterId, tag, s));
  if (card.vLine) {
    rows.push({
      letter_id: letterId,
      tag: V_TAG,
      ext_url: vSearchUrl(card.question),
      ext_title: card.sources.find((s) => s.tag === V_TAG)!.title,
      ext_source_kind: "own",
      license: "link_only",
    });
  }
  const del = await db.from("ds_letter_sources").delete().eq("letter_id", letterId);
  if (del.error) throw new Error(`원천 목록을 비우지 못했습니다: ${del.error.message}`);
  const ins = await db.from("ds_letter_sources").insert(rows);
  if (ins.error) throw new Error(`원천 목록을 넣지 못했습니다: ${ins.error.message}`);

  const meta: DraftMeta = {
    titles: gen.titles,
    glossary: gen.glossary,
    vMeaning: gen.vMeaning,
    promptVersion: 5,
    pickLog: gen.pickLog,
    unverified: gen.unverified,
    generatedAt: new Date().toISOString(),
    llmCalls: gen.llmCalls,
    ms: gen.ms,
    tokens: gen.tokens,
    cardFacts: card.facts.length,
    model: process.env.ZAI_MODEL || "glm-5.2",
    generation,
  };
  await writeDraftMeta(db, letterId, meta);

  // 채택한 질문은 "초안 있음" 으로 올린다. 검증 스크립트로 채택 전 질문을 시험할 때는 상태를 두지 않는다.
  if (card.question.status === "adopted") {
    await db.from("ds_questions").update({ status: "drafted" }).eq("id", questionId).eq("status", "adopted");
  }

  return { letterId, created: !existing, archivedTo, meta };
}
