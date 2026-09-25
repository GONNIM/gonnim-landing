// ② 초안 작성 · z.ai GLM 으로 7개 블록을 만든다.
//
// 원칙 하나 — 사실은 원천 초록에서만 온다. 모델이 모르는 것을 채우지 않게
// "초록에 없는 내용은 쓰지 말라"를 지시문에 넣고, 나온 결과에 거절 필터를 다시 건다.
// 필터에 걸린 블록은 버리지 않고 플래그를 달아 편집기에서 붉게 보여준다.

import OpenAI from "openai";
import { flagBlocks } from "./filters";
import { BLOCK_LABEL, BLOCK_ORDER, type BlockKind, type LetterBlock } from "./types";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

/** 사실을 담는 블록. 초안 단계에서 원천 태그를 미리 달아 둔다. */
const FACTUAL_KINDS: BlockKind[] = ["summary", "research", "mechanism", "industry"];

export type DraftSource = {
  /** ds_letter_sources 에 들어갈 원천 행 ID */
  sourceId: string;
  kind: "paper" | "gov_press";
  title: string;
  abstract: string | null;
  landingUrl: string;
  publishedDate: string | null;
  /** 공공누리 의무 출처표시 문구. 정부 보도자료일 때만 있다. */
  attribution: string | null;
};

export type DraftInput = {
  headline: string;
  hook: string | null;
  /** 후보 점수가 찾아낸 "통설을 깨는 한 문장". 훅 블록의 재료다. */
  paradoxLine: string | null;
  sources: DraftSource[];
};

export type DraftResult = {
  title: string;
  summary: string;
  blocks: LetterBlock[];
};

const SYSTEM_INSTRUCTIONS = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 초고를 쓴다.
독자는 과학 전공자가 아니지만 지적 호기심이 강한 성인이다.

# 넘지 않는 선 (위반하면 초안이 폐기된다)
- 제공된 원천 초록에 없는 사실을 쓰지 않는다. 모르면 그 문장을 비운다.
- 의학적 지시를 하지 않는다. "복용하십시오" "치료됩니다" 같은 표현을 쓰지 않는다.
- 원문을 40자 이상 그대로 옮기지 않는다. 반드시 다시 쓴다.
- 영화·소설의 설정을 사실로 주장하지 않는다. 훅에서는 질문만 한다.

# 문체
- 조사와 어미를 갖춘 완전한 문장으로 쓴다.
- 한 문장에 한 가지 내용만 담고, 한 문장을 60자 이내로 쓴다.
- 비유를 남용하지 않는다. 은유 블록에서만 한 번 쓴다.
- 영어 용어는 처음 나올 때 한국어 뜻을 붙인다.

# 블록 7개 (순서 고정)
1. summary  — 3줄 요약. 각 줄을 한 문장으로, 줄바꿈으로 구분한다.
2. hook     — 독자를 끌어들이는 도입. **반드시 물음표로 끝난다.** 사실 주장을 하지 않는다.
3. research — 이 연구가 무엇을 확인했는지. 원문을 읽으라는 안내를 포함한다.
4. mechanism— 왜 그런 일이 벌어지는지의 구조.
5. industry — 이 결과가 산업이나 정책에서 무엇을 움직이는지.
6. practice — 독자가 오늘 판단을 바꿀 지점. 지시가 아니라 판단 재료로 쓴다.
7. metaphor — 전체를 한 문장으로 붙잡는 비유 하나.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{
  "title": "레터 제목 · 40자 이내 · 역설이 드러나게",
  "summary": "한 문장 요약 · 100자 이내",
  "blocks": {
    "summary": "...", "hook": "...", "research": "...",
    "mechanism": "...", "industry": "...", "practice": "...", "metaphor": "..."
  }
}`;

export async function generateLetterDraft(input: DraftInput): Promise<DraftResult> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const err = new Error("ZAI_API_KEY 없음 · .env.local 과 Vercel 환경변수에 등록 필요");
    (err as { status?: number }).status = 503;
    throw err;
  }
  if (input.sources.length === 0) {
    const err = new Error("원천이 없습니다 · 초안을 만들 근거가 없습니다");
    (err as { status?: number }).status = 400;
    throw err;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });

  const response = await client.chat.completions.create({
    model: process.env.ZAI_MODEL || DEFAULT_MODEL,
    temperature: 0.6,
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: renderSourceBlock(input) },
    ],
    // @ts-expect-error z.ai 확장 파라미터 · OpenAI SDK 타입에는 없으나 서버는 수용
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("GLM 응답이 비었습니다");

  return parseDraft(content, input);
}

function renderSourceBlock(input: DraftInput): string {
  const sources = input.sources
    .map((s, i) => {
      const lines = [
        `[원천 ${i + 1}] ${s.kind === "paper" ? "1차 연구" : "정부 보도자료"}`,
        `제목: ${s.title}`,
        `발행일: ${s.publishedDate ?? "-"}`,
        `원문 주소: ${s.landingUrl}`,
        `초록: ${s.abstract ?? "(없음 — 이 원천으로 사실을 쓰지 말 것)"}`,
      ];
      if (s.attribution) lines.push(`의무 출처표시: ${s.attribution}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const paradox = input.paradoxLine
    ? `\n\n이 연구가 깨는 통설: ${input.paradoxLine}\n훅 블록은 이 통설을 세운 뒤 질문으로 끝낸다.`
    : "";

  return `다음 원천만 근거로 「지배상식」 한 편의 초고를 JSON 으로 쓰시오.

후보 제목: ${input.headline}
후보 훅 재료: ${input.hook ?? "-"}${paradox}

${sources}`;
}

function parseDraft(raw: string, input: DraftInput): DraftResult {
  const json = raw.trim().replace(/^```(?:json)?\n?|\n?```$/g, "");

  let parsed: {
    title?: unknown;
    summary?: unknown;
    blocks?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("GLM 응답이 JSON 이 아닙니다");
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : input.headline;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  const bodies = parsed.blocks ?? {};
  const sourceIds = input.sources.map((s) => s.sourceId);

  // 블록 순서는 모델이 아니라 우리가 정한다. 빈 블록도 자리를 남겨 둔다 —
  // 편집기에서 비어 있는 것이 보이면 사람이 채울 수 있다.
  const blocks: LetterBlock[] = BLOCK_ORDER.map((kind) => {
    const text = typeof bodies[kind] === "string" ? (bodies[kind] as string).trim() : "";
    return {
      kind,
      text,
      sourceIds: FACTUAL_KINDS.includes(kind) && text ? sourceIds : undefined,
    };
  });

  return { title, summary, blocks: flagBlocks(blocks) };
}

/** 사람이 빈 글을 직접 쓰기 시작할 때의 골격. LLM 을 부르지 않는다. */
export function emptyBlocks(): LetterBlock[] {
  return BLOCK_ORDER.map((kind) => ({ kind, text: "" }));
}

export function blockLabel(kind: BlockKind): string {
  return BLOCK_LABEL[kind];
}
