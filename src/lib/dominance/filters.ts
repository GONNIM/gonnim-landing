// 거절 필터 · operations.md 4종.
//
// 걸린 블록을 버리지 않는다. 플래그를 달아 편집기에서 붉게 보여주고,
// 플래그가 하나라도 남으면 [완성] 버튼이 잠긴다. 사람이 고칠 기회를 준다.

import type { LetterBlock } from "./types";

// 사실 문장을 담는 블록. 원천 태그가 없으면 무출처로 본다. 실천도 사실 블록이다(20차 B-5).
export const FACTUAL_KINDS = new Set(["summary", "research", "mechanism", "industry", "practice"]);

// 주소 · 도메인 · 이메일은 소문자로 쓰는 것이 정상이다. 미번역 검사 전에 지운다.
// 2026-09-28 실측: 초안의 "ClinicalTrials.gov" 가 `gov` 때문에 미번역으로 걸렸다.
const URL_LIKE = [
  /https?:\/\/\S+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[\w-]+(?:\.[\w-]+)*\.(?:gov|org|com|net|edu|int|io|dev|kr|uk|eu|info|co|ac)\b/gi,
];

// 단위 기호는 번역할 말이 아니다(26차 · 운동과 식욕 초안의 "kcal" 이 미번역으로 걸렸다).
const UNIT_TOKENS = /(?<![A-Za-z])(?:kcal|kJ|km|kg|mg|ml|mL|mm|cm|ms|g)(?![A-Za-z])/g;

function stripUrlLike(text: string): string {
  return URL_LIKE.reduce((t, re) => t.replace(re, " "), text).replace(UNIT_TOKENS, " ");
}

const RULES: {
  code: string;
  label: string;
  re: RegExp;
  prepare?: (text: string) => string;
}[] = [
  {
    code: "assertion",
    label: "단정 — 작품 설정을 사실로 주장",
    re: /(실제로\s*(가능|존재)|정말로\s*가능|사실로\s*(밝혀|확인)|과학적으로\s*증명(되었|됐))/,
  },
  {
    code: "advice",
    label: "조언 — 의학적 지시",
    re: /(복용\s*(하십시오|하세요|할\s*것)|처방받|치료(됩니다|된다|하십시오)|효과가\s*있습니다|드시면\s*됩니다|권장\s*용량)/,
  },
  {
    code: "quote",
    label: "인용 — 대사·가사·원문 직접 인용",
    re: /[“"][^”"]{40,}[”"]/,
  },
  {
    // 2026-09-25 실측: 초안에 "전염 차단 interventions의 표심이 어긋난다" 가 나왔다.
    // 모델이 단어 하나를 번역하지 않고 넘긴 것이고, 기존 규칙 셋은 잡지 못했다.
    //
    // 소문자만으로 이어진 3자 이상을 잡는다. 고유명사와 약어는 대문자를 품기
    // 때문에(medRxiv · VECTRI-ABM · DNA · COVID-19) 걸리지 않는다. 그래서 오탐이
    // 적고, 걸렸다면 대개 번역이 빠진 것이다.
    code: "untranslated",
    label: "미번역 — 영어 단어가 그대로 남음",
    re: /(?<![A-Za-z])[a-z]{3,}(?![A-Za-z])/,
    prepare: stripUrlLike,
  },
];

export function flagBlock(block: LetterBlock): string[] {
  const flags: string[] = [];

  for (const rule of RULES) {
    const text = rule.prepare ? rule.prepare(block.text) : block.text;
    if (rule.re.test(text)) flags.push(rule.label);
  }

  if (
    FACTUAL_KINDS.has(block.kind) &&
    block.text.trim().length > 0 &&
    (block.sourceIds?.length ?? 0) === 0
  ) {
    flags.push("무출처 — 원천 태그 없는 사실 문장");
  }

  return flags;
}

/**
 * 고르기 · 쓰기 지시문이 쓰는 범주 이름(29차 B-1). 본문이나 요약에 나오면 지시문의 말이 새어 나온 것이다.
 * 28차 glm-5.3 초안의 요약이 "가장 반직관적인 것은" · "내 몸과의 연결로는" 으로 시작했다.
 * 일상어로도 쓰이는 "통설" · "역설" 한 낱말은 넣지 않는다(훅이 정당하게 쓴다).
 */
export const CATEGORY_TERMS = [
  "반직관",
  "내 몸과의 연결",
  "내 몸 연결",
  "통설 파괴",
  "통설을 깨는 것",
  "놀라운 수치",
  "독자의 몸으로 이어지는",
  "독자의 판단으로 이어지는",
] as const;

export function categoryTerms(text: string): string[] {
  return CATEGORY_TERMS.filter((t) => text.includes(t));
}

export function categoryMark(text: string): string | null {
  const hits = categoryTerms(text);
  return hits.length ? `범주 이름 — 지시문의 말이 본문에 나옴: ${hits.join(" · ")}` : null;
}

export function flagBlocks(blocks: LetterBlock[]): LetterBlock[] {
  return blocks.map((b) => {
    const flags = flagBlock(b);
    // 표시만(marks) · countFlags 에 들어가지 않는다 → [완성] 잠금 · 리뷰 12검사와 무관
    const mark = categoryMark(b.text);
    return { ...b, flags: flags.length > 0 ? flags : undefined, marks: mark ? [mark] : undefined };
  });
}

export function countFlags(blocks: LetterBlock[]): number {
  return blocks.reduce((n, b) => n + (b.flags?.length ?? 0), 0);
}

// 훅은 질문만 해야 한다 (operations.md 승인 3번). 편집기 경고용 — 필터가 아니다.
export function hookIsQuestion(blocks: LetterBlock[]): boolean {
  const hook = blocks.find((b) => b.kind === "hook");
  if (!hook || !hook.text.trim()) return false;
  return /[?？]\s*$/.test(hook.text.trim());
}
