// 거절 필터 · operations.md 4종.
//
// 걸린 블록을 버리지 않는다. 플래그를 달아 편집기에서 붉게 보여주고,
// 플래그가 하나라도 남으면 [완성] 버튼이 잠긴다. 사람이 고칠 기회를 준다.

import type { LetterBlock } from "./types";

// 사실 문장을 담는 블록. 원천 태그가 없으면 무출처로 본다.
const FACTUAL_KINDS = new Set(["summary", "research", "mechanism", "industry"]);

const RULES: { code: string; label: string; re: RegExp }[] = [
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
  },
];

export function flagBlock(block: LetterBlock): string[] {
  const flags: string[] = [];

  for (const rule of RULES) {
    if (rule.re.test(block.text)) flags.push(rule.label);
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

export function flagBlocks(blocks: LetterBlock[]): LetterBlock[] {
  return blocks.map((b) => {
    const flags = flagBlock(b);
    return flags.length > 0 ? { ...b, flags } : { ...b, flags: undefined };
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
