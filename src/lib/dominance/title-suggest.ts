// 48차 A · D51 · 제목 · 한 문장 요약 추천(50차부터 OpenAI API).
//
// 쓰기와 교차 리뷰는 D46 대로 GLM 이다. 여기는 다 쓴 글의 제목과 한 문장 요약만 묶음 3개로 제안한다.
// 결과는 ds-drafts/<letterId>/meta.json 의 title_suggestions 에 시각과 함께 남긴다. 글은 바꾸지 않는다.
// 규칙(코드로 다시 검사): 제목 30자 안 · 요약 60자 안(태그는 세지 않음) · 범주 이름 낱말 금지 ·
// 거절 필터(의학적 지시 등) 금지 · 카드에 없는 수치 금지. 어긴 묶음은 빼고 몇 개를 뺐는지 남긴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiReady, OPENAI_MODEL, callJson, costOf, type Usage } from "./llm";
import { loadQuestionCard } from "./card";
import { extractNumbers } from "./card-check";
import { categoryTerms, flagBlock } from "./filters";
import { readDraftMeta, writeDraftMeta, type DraftMeta } from "./draft-store";
import { BLOCK_LABEL, type LetterBlock } from "./types";

export type TitleSuggestion = { title: string; summary: string; why: string };
export type TitleSuggestions = {
  at: string;
  model: string;
  items: TitleSuggestion[];
  dropped: { title: string; reason: string }[];
  /** 48차 · 걸린 시간(ms) · 토큰 · 비용(달러 · 가격표에 없으면 null) */
  ms?: number;
  tokens?: { input: number; output: number };
  cost?: number | null;
};

const TAG = /\[[A-Z]{1,2}[0-9]{0,2}\]/g;
const plainLen = (s: string) => s.replace(TAG, "").replace(/\s+/g, " ").trim().length;

/** 제목 · 요약 두 칸에 거절 필터와 범주 이름 검사를 돌린다. 걸린 이유들을 돌려준다(빈 배열이면 통과). ④ 저장도 같은 검사를 쓴다 */
export function titleSummaryProblems(title: string, summary: string): string[] {
  const out: string[] = [];
  for (const [name, text] of [
    ["제목", title],
    ["한 문장 요약", summary],
  ] as const) {
    // 사실 블록이 아닌 kind 로 돌려 "무출처" 는 빼고 거절 필터 네 가지만 본다
    for (const f of flagBlock({ kind: "hook", text } as LetterBlock)) out.push(`${name} · ${f}`);
    const terms = categoryTerms(text);
    if (terms.length) out.push(`${name} · 범주 이름 — 지시문의 말이 나옴: ${terms.join(" · ")}`);
  }
  return out;
}

const SYSTEM = `너는 한국어 과학 레터의 편집자다. 다 쓴 글을 읽고 제목과 한 문장 요약을 묶음 3개로 제안한다.
지킬 것:
- 제목은 30자 안. 질문형이어도 된다. 독자가 "왜?" 하고 열어 보고 싶게 쓰되 과장하지 않는다.
- 한 문장 요약은 60자 안(태그 [P5] 같은 꼬리표는 글자 수에 넣지 않는다). 글의 결론 하나를 사실대로 적는다. 사실을 말하면 그 사실의 카드 태그를 [P5] 처럼 붙인다.
- 의학적 지시(복용하십시오 · 권장 용량 · 치료된다 등)를 쓰지 않는다.
- "반직관" · "통설 파괴" · "놀라운 수치" · "내 몸과의 연결" 같은 지시문의 범주 이름을 쓰지 않는다.
- 사실 카드에 없는 숫자를 쓰지 않는다.
- 영어 낱말을 번역 없이 남기지 않는다.
- 세 묶음은 서로 다른 각도로 쓴다(예: 질문 · 결론 · 장면).
출력: {"items":[{"title":"…","summary":"…","why":"이 묶음을 고른 이유 한 줄"}, … 3개]}`;

export async function suggestTitles(db: SupabaseClient, letterId: string): Promise<TitleSuggestions> {
  if (!openaiReady()) throw new Error("OPENAI_API_KEY 없음");
  const { data: letter } = await db
    .from("ds_letters")
    .select("title, summary, blocks, question_id, review_checks")
    .eq("id", letterId)
    .single<{ title: string; summary: string | null; blocks: LetterBlock[]; question_id: string | null; review_checks: { crossReview?: { kind: string; message: string }[] } | null }>();
  if (!letter) throw new Error("글을 찾지 못했습니다");
  const card = letter.question_id ? await loadQuestionCard(db, letter.question_id) : null;

  const body = letter.blocks.map((b) => `## ${BLOCK_LABEL[b.kind]}\n${b.text}`).join("\n\n");
  const facts = (card?.facts ?? []).map((f) => `[${f.tag}] ${f.text}${f.ko ? `\n   뜻: ${f.ko}` : ""}`).join("\n");
  const notes = (letter.review_checks?.crossReview ?? []).map((n) => `- ${n.kind}: ${n.message}`).join("\n");
  const user = [
    `지금 제목: ${letter.title}`,
    `지금 한 문장 요약: ${letter.summary ?? "(없음)"}`,
    "",
    "본문(블록 7개):",
    body,
    "",
    "사실 카드(원문 · 뜻):",
    facts || "(카드 없음)",
    ...(notes ? ["", "교차 리뷰 의견:", notes] : []),
  ].join("\n");

  const t0 = Date.now();
  const tokens = { input: 0, output: 0 };
  let cost: number | null = 0;
  let served: string | null = null;
  const usage = (u: Usage) => {
    if (u.served) served = u.served;
    tokens.input += u.input;
    tokens.output += u.output;
    const c = costOf(u);
    cost = cost === null || c === null ? null : cost + c;
  };
  const raw = (await callJson(SYSTEM, user, 1500, { tier: "main", provider: "openai", stage: "제목 · 요약 추천", usage })) as { items?: Partial<TitleSuggestion>[] };
  const ms = Date.now() - t0;

  // 카드에 있는 숫자(원문 · 뜻)
  const cardNums = new Set((card?.facts ?? []).flatMap((f) => [...extractNumbers(f.text), ...extractNumbers(f.ko ?? "")].map((n) => n.value)));
  const items: TitleSuggestion[] = [];
  const dropped: TitleSuggestions["dropped"] = [];
  for (const it of raw.items ?? []) {
    const title = String(it.title ?? "").trim();
    const summary = String(it.summary ?? "").trim();
    const why = String(it.why ?? "").trim();
    const reasons: string[] = [];
    if (!title || !summary) reasons.push("빈 칸");
    if (plainLen(title) > 30) reasons.push(`제목 ${plainLen(title)}자`);
    if (plainLen(summary) > 60) reasons.push(`요약 ${plainLen(summary)}자`);
    reasons.push(...titleSummaryProblems(title, summary));
    if (card) {
      const extra = [...extractNumbers(title), ...extractNumbers(summary)].map((n) => n.value).filter((v) => !cardNums.has(v));
      if (extra.length) reasons.push(`카드에 없는 수치 ${extra.join(", ")}`);
    }
    if (reasons.length) dropped.push({ title, reason: reasons.join(" · ") });
    else items.push({ title, summary, why });
  }

  const result: TitleSuggestions = { at: new Date().toISOString(), model: served ?? OPENAI_MODEL, items: items.slice(0, 3), dropped, ms, tokens, cost };
  const meta = await readDraftMeta(db, letterId);
  if (meta) await writeDraftMeta(db, letterId, { ...meta, title_suggestions: result } as DraftMeta);
  return result;
}
