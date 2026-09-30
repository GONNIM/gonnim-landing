// ③ [글 작성하기] · 사실 카드만으로 초안을 쓴다 (D33 · D36 · D37 · 20차 B-3).
//
// LLM 2회: ① 용어표 ② 초안(제목 3 · 한 문장 요약 · 블록 7).
// 지시문은 pilot-draft-prompt-G5.md 의 4판(3판 조건 1~24 + 21차 조건 25~30)을 질문에 매이지 않게 옮긴 것이다.
// 옛 draft.ts(초록 입력)는 옛 후보 경로에서만 쓰고 6단계에서 지운다.

import { flagBlocks } from "./filters";
import { cardPrompt, type QuestionCard } from "./card";
import { callJson } from "./question-llm";
import { sentencesOf, tagsIn } from "./tags";
import { BLOCK_ORDER, type LetterBlock } from "./types";

export { tagsIn } from "./tags";

export type GlossaryItem = {
  /** 카드의 원어 표현 */
  source: string;
  /** 쉬운 말 */
  plain: string;
  /** 한국어 전문어 · 음역. 없으면 빈 문자열 */
  original: string;
  /** 첫 등장 형식 "쉬운 말(원어)" */
  first: string;
  kind: "noun" | "procedure";
};

export type CardDraft = {
  titles: string[];
  summary: string;
  glossary: GlossaryItem[];
  /** [V] 검색어의 뜻(조건 30) */
  vMeaning: string | null;
  blocks: LetterBlock[];
  llmCalls: number;
  ms: { glossary: number; draft: number };
  tokens: { input: number; output: number };
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ── ① 용어표 ────────────────────────────────────────────────────────────────

const GLOSSARY_SYSTEM = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 편집을 돕는다.
사실 카드(영어 원문)를 읽고 두 가지를 낸다.

# 1. 용어표 (조건 28)
- **독자가 알아야 할 말만** 3~6개 고른다. 글에서 그 말 자체를 써야 하는 것이다(예: 만보계 · 좌식시간 · 병체결합).
- **통계 방법과 지표 이름은 넣지 않는다**(위험비 · 스플라인 · 사분위 · 다변량 보정 · 전원인사망 · 신뢰구간 등). 이런 말은 본문에서 뜻으로 풀어 쓴다.
- 실험 절차를 나타내는 말이 카드에 있으면 1개까지 넣는다.
- plain(쉬운 풀이)은 **15자 안**으로 쓴다. "잇다 · 연결하다 · 노출하다 · 순환계 · 인자 · 밀도 · 발현" 같은 말을 쓰지 않는다.
- original(원어)은 한국어 전문어나 음역으로 쓴다. 영어 알파벳은 약어만 쓴다. 없으면 빈 문자열.
- first 는 쓰지 않아도 된다. 프로그램이 "원어(쉬운 풀이)" 로 만든다. 괄호 안에 영어를 넣지 않는다.
- kind 는 noun 또는 procedure.

# 2. [V] 검색어의 뜻 (조건 30)
- 받은 Europe PMC 검색어가 어떤 논문을 센 것인지 한국어 한 구절로 쓴다(예: "하루 걸음 수와 사망률을 함께 다룬 논문"). 25자 안.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "items": [ { "source": "...", "plain": "...", "original": "...", "first": "...", "kind": "noun" } ], "v_meaning": "..." }`;

async function makeGlossary(
  card: QuestionCard,
  tokens: CardDraft["tokens"],
): Promise<{ glossary: GlossaryItem[]; vMeaning: string | null }> {
  const facts = card.facts.map((f) => `[${f.tag}] ${f.text}`).join("\n");
  const q0 = card.question.searchQueries[0] ?? "";
  const o = (await callJson(GLOSSARY_SYSTEM, `질문: ${card.question.question}\n[V] 검색어: ${q0}\n\n# 사실 카드\n${facts}`, 2000, {
    temperature: 0.3,
    usage: (u) => {
      tokens.input += u.input;
      tokens.output += u.output;
    },
  })) as { items?: unknown[]; v_meaning?: unknown };
  const glossary = (o.items ?? [])
    .flatMap((it) => {
      const r = (it ?? {}) as Record<string, unknown>;
      const plain = str(r.plain);
      if (!plain) return [];
      // 원어에 영어 소문자 단어가 섞이면 버린다(약어만 허용 · 미번역 필터와 같은 기준).
      const rawOriginal = str(r.original).replace(/\([^)]*\)/g, "").trim();
      const original = /(?<![A-Za-z])[a-z]{3,}(?![A-Za-z])/.test(rawOriginal) ? "" : rawOriginal;
      return [
        {
          source: str(r.source),
          plain,
          original,
          // 첫 등장 형식은 프로그램이 만든다. 모델이 괄호 안에 영어 원어를 넣었다(21차 만 보 2판: "만보계(pedometer)").
          first: original && original !== plain ? `${original}(${plain})` : plain,
          kind: (str(r.kind) === "procedure" ? "procedure" : "noun") as GlossaryItem["kind"],
        },
      ];
    })
    .slice(0, 6);
  return { glossary, vMeaning: str(o.v_meaning) || null };
}

// ── ② 초안 ──────────────────────────────────────────────────────────────────

/** 4판 조건 (pilot-draft-prompt-G5.md · 3판 조건 1~24 + 21차 25~30) · 질문에 매이지 않게 옮김 */
export const DRAFT_SYSTEM = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 초고를 쓴다.
독자는 과학 전공자가 아니지만 지적 호기심이 강한 성인이다.
글의 축은 질문 하나다. 논문은 그 질문에 대한 증거다.

# 재료는 사실 카드뿐이다 (위반하면 초안이 폐기된다)
1. 사실 문장은 사실 카드에 있는 것만 쓴다. 카드에 없는 사실은 쓰지 않는다.
   카드의 영어 문장을 한국어로 옮겨 쓴다. 옮길 때 내용을 더하거나 부풀리지 않는다.
2. "링크만 있는 원천" 은 메모에 적힌 사실만 우리 말로 쓴다. 메모에 없는 숫자나 이름을 더하지 않는다.
3. **요약을 포함한 모든 사실 문장** 끝에 태그를 대괄호로 붙인다. 예: "...줄었다[E1]." 둘이면 [E1][M2].
   훅 · 실천 · 은유의 사실 문장도 같다. 풀어 쓴 문장, 해설 문장에도 원래 태그를 붙인다.
   카드에 없는 태그를 만들지 않는다.
4. 카드는 재료 창고다. 카드에 없는 사실은 쓰지 않는다. 카드의 사실을 다 쓰지도 않는다(아래 25).

# 고르기와 잇기 (4판)
25. **고르기:** 블록마다 핵심 사실 **2~4개**를 카드에서 고른다. 나머지는 쓰지 않는다(원천 목록에만 남는다).
    고르는 기준은 셋이다. 통설을 깨는 것 · 놀라운 수치 · 독자의 몸으로 이어지는 것.
26. **잇는 문장:** 사실 문장 사이에 독자에게 말을 거는 문장과 앞뒤를 붙이는 문장을 쓴다.
    잇는 문장에는 사실(수치 · 대상 · 결과)을 넣지 않는다. 잇는 문장에는 태그가 없어도 된다.
    분량(7블록 합계 1,800~2,400자)은 잇는 문장으로 채운다. 사실을 늘려 채우지 않는다.
27. **수치:** 블록마다 수치 **3개 이하**. 표본 크기와 추적 기간은 **글 전체에서 한 번만** 쓴다.
    위험비 · 배수는 "절반으로" · "두 배로" 같은 말로 쓴다. 사분위 중간값처럼 통계 구간을 나열하지 않는다.
28. **통계 용어 금지:** 통계 방법과 지표 이름(위험비 · 스플라인 · 사분위 · 다변량 보정 · 전원인사망 · 신뢰구간)은 본문에 쓰지 않는다.
    뜻으로 푼다(예: "나이와 성별을 감안해도" · "어떤 이유로든 사망할 위험").
29. **문단:** 블록 안에서 2~3문장마다 줄을 바꾼다(빈 줄 없이 줄바꿈 한 번). 3줄 요약은 세 줄 고정이다.
30. **[V]:** 연도별 논문 수는 카드의 [V] 줄에 적힌 "검색어의 뜻" 그대로 부른다(예: "하루 걸음 수와 사망률을 함께 다룬 논문").

# 블록 7개
- hook      독자가 이미 믿는 통설 → 놀라운 수치 하나 → 질문. **네 문장 안에** 끝내고 **반드시 물음표로 끝난다.**
            수치 문장에는 태그를 붙인다(연도별 논문 수면 [V]).
- research  정설 칸의 사실을 먼저 세우고, 예외 칸의 결과를 보여 준다.
- mechanism 기전 칸의 사실로 왜 그런지 쓴다. 카드에 반론이 있으면 반드시 넣는다.
            기전 칸이 비었으면 예외 칸에 적힌 조건 · 한계만 쓴다. 지어내지 않는다.
- industry  산업 칸의 사실을 **시간순으로** 잇는다. 링크만 있는 원천은 메모만 쓴다.
            산업 재료가 카드에 없으면 빈 문자열로 둔다.
- practice  독자가 오늘 판단을 바꿀 지점을 **관찰로만** 쓴다. "~하라" "~하십시오" 같은 지시를 쓰지 않는다.
            기관의 경고나 권고가 카드에 있으면 이 블록에 둔다. **"의학적 조언이 아니다" 같은 고지 문장은 쓰지 않는다**(발행 틀이 붙인다).
            실천 블록도 사실 블록이다. 사실 문장마다 태그를 붙인다.
- metaphor  전체를 한 문장으로 붙잡는 비유 하나. 독자의 일이나 생활로 넓힌다. 과학을 다시 설명하는 비유는 쓰지 않는다.
- summary   3줄 요약. 세 문장, 줄바꿈으로 구분한다. 첫 줄은 통설과 예외, 둘째 줄은 가장 반직관적인 결과, 셋째 줄은 내 몸과의 연결.
            **요약은 나머지 여섯 블록을 다 쓴 뒤 맨 마지막에 쓴다.** 요약의 사실 문장에도 태그를 붙인다.

# 사실 문장 규칙
5. 사실 문장마다 대상을 쓴다. 카드의 "대상" 칸을 따른다. 사람 · 쥐 · 랫 · 나이 · 나라를 구별한다.
   동물 결과를 사람에게 옮겨 말하지 않는다. "~일 수 있다" 를 "~이다" 로 바꾸지 않는다. 연관을 원인으로 쓰지 않는다.
6. 접속어: 원천에 없는 인과나 대조를 만들지 않는다. "때문에 · 그래서 · 따라서 · 그럼에도 · 그런데도" 를 두 사실 사이에 넣으려면
   그 관계가 카드에 적혀 있어야 한다.
7. 기관의 경고 · 권고는 원문이 누구에게 한 말인지 그대로 쓴다(예: "소비자에게 주의를 당부했다"). 기관이 나열한 질병 이름은 "여러 질환" 으로 줄인다.
8. 용어: 아래 용어표를 쓴다. 처음 나올 때 용어표의 "첫 등장" 형식 그대로 쓰고, 그다음부터는 쉬운 말이나 원어를 쓴다.
   용어표에 없는 통계 용어는 쓰지 않는다(조건 28).
9. 실험 절차는 독자가 머릿속에 그릴 수 있는 말로 쓴다. "잇다 · 연결하다 · 노출하다 · 순환계 · 인자 · 밀도 · 발현" 같은 말을 쓰지 않는다.

# 넘지 않는 선
- 약품 · 용량 · 진단 · 치료를 권하는 문장을 쓰지 않는다. "복용하십시오" "치료됩니다" "효과가 있습니다" 를 쓰지 않는다.
- 영화 · 소설 작품을 인용하지 않는다.
- 원천 문장을 40자 이상 그대로 옮기지 않는다. 반드시 다시 쓴다.

# 문체
- 한국어만 쓴다. 영어 단어를 그대로 남기지 않는다. 고유명사와 약어(FDA · NIH · BMI 등)는 예외다.
- 조사와 어미를 갖춘 완전한 문장으로 쓴다. 한 문장에 한 내용만 담는다. 한 문장은 60자 이하를 권한다.
- 비유는 은유 블록에서만 한 번 쓴다.
- 블록 안에서 **2~3문장마다 줄을 바꾼다**(조건 29).

# 제목 3개
- 독자가 이미 쓰는 말로 묻는다. 질문형도 된다.
- 대상(쥐 · 사람)을 숨기지 않고, "~일 수 있다" 를 단정으로 바꾸지 않는다. 제목도 사실 문장과 같은 기준이다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다. summary 블록과 한 문장 요약은 맨 뒤에 둔다.
{
  "titles": ["...", "...", "..."],
  "blocks": { "hook": "...", "research": "...", "mechanism": "...", "industry": "...", "practice": "...", "metaphor": "...", "summary": "..." },
  "summary": "한 문장 요약 · 100자 이내 · 사실 문장이면 태그"
}`;

export async function generateCardDraft(card: QuestionCard): Promise<CardDraft> {
  const tokens = { input: 0, output: 0 };
  const t0 = Date.now();
  const { glossary, vMeaning } = await makeGlossary(card, tokens);
  const t1 = Date.now();

  const gl = glossary.length
    ? glossary.map((g) => `- ${g.source} → 첫 등장 "${g.first}" · 쉬운 말 "${g.plain}"`).join("\n")
    : "(없음)";
  const o = (await callJson(
    DRAFT_SYSTEM,
    `${cardPrompt(card, vMeaning)}\n\n# 용어표 (첫 등장에 이 형식 그대로)\n${gl}\n\n위 재료에서 골라 「지배상식」 한 편의 초고를 JSON 으로 쓰시오.`,
    9000,
    {
      temperature: 0.6,
      usage: (u) => {
        tokens.input += u.input;
        tokens.output += u.output;
      },
    },
  )) as { titles?: unknown[]; blocks?: Record<string, unknown>; summary?: unknown };
  const t2 = Date.now();

  const bodies = o.blocks ?? {};
  const blocks: LetterBlock[] = BLOCK_ORDER.map((kind) => {
    const text = kind === "summary" ? str(bodies[kind]) : breakParagraphs(str(bodies[kind]));
    const tags = tagsIn(text);
    return { kind, text, sourceIds: tags.length ? tags : undefined };
  });

  return {
    titles: (o.titles ?? []).map(str).filter(Boolean).slice(0, 3),
    summary: str(o.summary),
    glossary,
    vMeaning,
    blocks: flagBlocks(blocks),
    llmCalls: 2,
    ms: { glossary: t1 - t0, draft: t2 - t1 },
    tokens,
  };
}

/**
 * 조건 29 후처리 · 모델이 줄을 나누지 않았으면 문장 3개마다 줄을 나눈다.
 * 이미 줄바꿈이 있는 문단은 그 안에서만 3문장 넘게 이어질 때 나눈다.
 */
export function breakParagraphs(text: string, per = 3): string {
  return text
    .split(/\n+/)
    .map((para) => {
      const sens = sentencesOf(para).map((x) => x.text);
      if (sens.length <= per) return para.trim();
      const out: string[] = [];
      for (let i = 0; i < sens.length; i += per) out.push(sens.slice(i, i + per).join(" "));
      return out.join("\n");
    })
    .filter(Boolean)
    .join("\n");
}
