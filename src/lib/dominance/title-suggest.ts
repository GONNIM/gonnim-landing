// 48차 A · D51 · 제목 · 한 문장 요약 추천(50차부터 OpenAI API).
//
// 쓰기와 교차 리뷰는 D46 대로 GLM 이다. 여기는 다 쓴 글의 제목과 한 문장 요약만 묶음 3개로 제안한다.
// 결과는 ds-drafts/<letterId>/meta.json 의 title_suggestions 에 시각과 함께 남긴다. 글은 바꾸지 않는다.
// 규칙(코드로 다시 검사): 제목 30자 안 · 요약 60자 안(태그는 세지 않음) · 범주 이름 낱말 금지 ·
// 거절 필터(의학적 지시 등) 금지 · 카드에 없는 수치 금지. 어긴 묶음은 빼고 몇 개를 뺐는지 남긴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestReady, callJsonWithFallback, costOf, type Usage } from "./llm";
import { loadQuestionCard } from "./card";
import { extractNumbers } from "./card-check";
import { categoryTerms, flagBlock } from "./filters";
import { readDraftMeta, writeDraftMeta, type DraftMeta } from "./draft-store";
import { BLOCK_LABEL, type LetterBlock } from "./types";

import type { TitleType } from "./title-types";
export { TITLE_TYPE_LABEL, type TitleType } from "./title-types";
export type TitleSuggestion = { title: string; summary: string; why: string; type?: TitleType };

/** 53차 I · 과장 낱말(코드 검사 · 걸리면 그 묶음을 뺀다) */
const HYPE = ["충격", "경악", "반드시", "무조건", "100%", "모두가"];
export type TitleSuggestions = {
  at: string;
  model: string;
  items: TitleSuggestion[];
  dropped: { title: string; reason: string }[];
  /** 54차 · 답한 공급자 · OpenAI 에서 대체했으면 그 이유 */
  provider?: "openai" | "zai";
  fallback_from?: "openai" | null;
  fallback_reason?: string | null;
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

const SYSTEM = `너는 한국어 과학 레터의 편집자다. 다 쓴 글을 읽고 제목과 부제목(한 문장 요약)을 묶음 3개로 제안한다.
세 묶음은 유형이 서로 달라야 한다. 각 묶음에 type 을 붙인다.
- question(질문형): 독자가 궁금해할 질문으로 쓴다. 답을 제목에서 다 주지 않는다.
- flip(통설 뒤집기형): 독자가 믿던 것을 한 문장으로 뒤집는다.
- apply(내 몸 적용형): 독자의 하루에 닿는 말로 쓴다.
지킬 것:
- 제목은 30자 안. 부제목은 60자 안.
- 부제목은 글의 핵심 사실 하나를 담는다. 그 사실은 사실 카드 문장이나 3줄 요약에 근거가 있어야 한다. 태그([P5] 같은 꼬리표)는 쓰지 않는다.
- 금지: 카드에 없는 수치 · 카드에 없는 단정, 과장 낱말(충격 · 경악 · 반드시 · 무조건 · 100% · 모두가), 느낌표, 의학적 지시(복용하십시오 · 권장 용량 · 치료된다 등), 지시문의 범주 이름("반직관" · "통설 파괴" · "놀라운 수치" · "내 몸과의 연결" 등), 번역하지 않은 영어 낱말.
- why 에는 이 묶음을 고른 이유를 한 줄로 쓴다.
출력: {"items":[{"type":"question","title":"…","summary":"…","why":"…"},{"type":"flip",…},{"type":"apply",…}]}`;

export async function suggestTitles(db: SupabaseClient, letterId: string): Promise<TitleSuggestions> {
  if (!suggestReady()) throw new Error("OPENAI_API_KEY 없음");
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
  const usage = (u: Usage) => {
    tokens.input += u.input;
    tokens.output += u.output;
    const c = costOf(u);
    cost = cost === null || c === null ? null : cost + c;
  };

  let who: { provider: "openai" | "zai"; model: string; fallback: boolean; firstError: string | null } | null = null;
  // 카드에 있는 숫자(원문 · 뜻)
  const cardNums = new Set((card?.facts ?? []).flatMap((f) => [...extractNumbers(f.text), ...extractNumbers(f.ko ?? "")].map((n) => n.value)));
  const byType = new Map<TitleType, TitleSuggestion>();
  const dropped: TitleSuggestions["dropped"] = [];
  // 53차 I · 유형 3개가 다 차지 않으면 한 번 더 부른다
  for (let attempt = 0; attempt < 2 && byType.size < 3; attempt++) {
    // 54차 A · OpenAI 먼저 · 실패하면 GLM main 으로 대신
    const r = await callJsonWithFallback(SYSTEM, user, 1500, { stage: attempt === 0 ? "제목 · 요약 추천" : "제목 · 요약 추천(모자라 한 번 더)", usage });
    if (!who) who = r;
    const raw = r.data as { items?: Partial<TitleSuggestion>[] };
    for (const it of raw.items ?? []) {
      const title = String(it.title ?? "").trim();
      const summary = String(it.summary ?? "").trim();
      const why = String(it.why ?? "").trim();
      const type = (["question", "flip", "apply"] as const).find((t) => t === it.type);
      const reasons: string[] = [];
      if (!type) reasons.push(`유형 없음(${String(it.type ?? "")})`);
      if (!title || !summary) reasons.push("빈 칸");
      if (plainLen(title) > 30) reasons.push(`제목 ${plainLen(title)}자`);
      if (plainLen(summary) > 60) reasons.push(`부제목 ${plainLen(summary)}자`);
      if (TAG.test(summary) || TAG.test(title)) reasons.push("태그를 씀");
      TAG.lastIndex = 0;
      if (/[!！]/.test(title + summary)) reasons.push("느낌표");
      const hype = HYPE.filter((w) => (title + summary).includes(w));
      if (hype.length) reasons.push(`과장 낱말 ${hype.join(" · ")}`);
      reasons.push(...titleSummaryProblems(title, summary));
      if (card) {
        const extra = [...extractNumbers(title), ...extractNumbers(summary)].map((n) => n.value).filter((v) => !cardNums.has(v));
        if (extra.length) reasons.push(`카드에 없는 수치 ${extra.join(", ")}`);
      }
      if (reasons.length) dropped.push({ title, reason: reasons.join(" · ") });
      else if (type && !byType.has(type)) byType.set(type, { title, summary, why, type });
    }
  }
  const items = (["question", "flip", "apply"] as const).map((t) => byType.get(t)).filter((x): x is TitleSuggestion => !!x);
  const ms = Date.now() - t0;

  const w = who as { provider: "openai" | "zai"; model: string; fallback: boolean; firstError: string | null } | null;
  const result: TitleSuggestions = {
    at: new Date().toISOString(),
    model: w?.model ?? "",
    provider: w?.provider,
    fallback_from: w?.fallback ? "openai" : null,
    fallback_reason: w?.fallback ? w.firstError : null,
    items,
    dropped,
    ms,
    tokens,
    cost,
  };
  const meta = await readDraftMeta(db, letterId);
  if (meta) await writeDraftMeta(db, letterId, { ...meta, title_suggestions: result } as DraftMeta);
  return result;
}
