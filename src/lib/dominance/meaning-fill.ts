// 53차 G · D54 · 뜻 초안 자동 채움. 글에 쓰인 문장 가운데 뜻(fact_ko)이 빈 것만 light 모델 1회로 채운다.
//
// 확인 시각은 비워 둔다(미확인 · D50 의 확인은 사람이 한다). 이미 뜻이 있는 문장은 건드리지 않는다.
// 증거 표를 처음 열 때 한 번 자동으로 돌고(meta.auto_translated_at), 그 뒤에는 「뜻 초안 다시 받기」로만 돈다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadQuestionCard, usedFacts } from "./card";
import { loadEvidence, setFactKo, SLOTS } from "./evidence";
import { translateFacts, type KoInput } from "./evidence-llm";
import { costOf, MODEL_LIGHT, type Usage } from "./llm";
import { prevSentence } from "./prev-sentence";
import { readDraftMeta, writeDraftMeta, type DraftMeta } from "./draft-store";

const MAX_PER_CALL = 20;

export type MeaningFill = { ran: boolean; filled: number; empty: number; model: string; ms: number; cost: number | null; letterId: string | null };

export async function fillUsedMeanings(db: SupabaseClient, questionId: string, opts: { auto: boolean }): Promise<MeaningFill> {
  const none = (letterId: string | null, empty = 0): MeaningFill => ({ ran: false, filled: 0, empty, model: MODEL_LIGHT, ms: 0, cost: 0, letterId });
  const { data: letter } = await db
    .from("ds_letters")
    .select("id, blocks")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; blocks: { text: string }[] }>();
  if (!letter) return none(null);
  const meta = await readDraftMeta(db, letter.id);
  if (opts.auto && meta?.auto_translated_at) return none(letter.id);

  const card = await loadQuestionCard(db, questionId);
  if (!card) return none(letter.id);
  const empty = usedFacts(card, letter.blocks).filter((f) => !f.ko?.trim());
  if (empty.length === 0) return none(letter.id);

  // 앞 문장(초록) · 출처 이름을 붙인다
  const table = await loadEvidence(db, questionId);
  const paperIds = [...new Set(SLOTS.flatMap((s) => table.slots[s]).map((g) => g.source.paperId).filter((x): x is string => !!x))];
  const { data: papers } = paperIds.length ? await db.from("ds_papers").select("id, abstract").in("id", paperIds) : { data: [] };
  const abstractOf = new Map(((papers ?? []) as { id: string; abstract: string | null }[]).map((p) => [p.id, p.abstract]));
  const info = new Map<string, { source: string; prev: string | null }>();
  for (const g of SLOTS.flatMap((s) => table.slots[s])) {
    for (const f of g.facts) {
      info.set(`${f.rowId}:${f.line}`, { source: g.source.title, prev: g.source.paperId ? prevSentence(abstractOf.get(g.source.paperId), f.text) : null });
    }
  }
  const inputs: KoInput[] = empty.slice(0, MAX_PER_CALL).map((f) => ({
    id: f.id,
    text: f.text,
    subject: f.subject,
    year: f.year,
    source: info.get(f.id)?.source ?? f.tag,
    prev: info.get(f.id)?.prev ?? null,
  }));

  const t0 = Date.now();
  let cost: number | null = 0;
  let model = MODEL_LIGHT;
  const usage = (u: Usage) => {
    model = u.served ?? u.model;
    const c = costOf(u);
    cost = cost === null || c === null ? null : cost + c;
  };
  const ko = await translateFacts(card.question.question, inputs, usage);
  let filled = 0;
  for (const [id, text] of ko) {
    const [rowId, line] = id.split(":");
    await setFactKo(db, rowId, Number(line), text, false);
    filled++;
  }
  if (meta) await writeDraftMeta(db, letter.id, { ...meta, auto_translated_at: new Date().toISOString() } as DraftMeta);
  return { ran: true, filled, empty: empty.length, model, ms: Date.now() - t0, cost, letterId: letter.id };
}
