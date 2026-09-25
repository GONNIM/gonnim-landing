// ④ 교차 리뷰 · 글을 쓴 것과 다른 지시문으로 같은 모델에게 한 번 더 묻는다.
//
// 고치지 않는다. 의견만 낸다. 고칠지는 사람이 판단한다.
// 편당 한 번만 부른다 — 주 3회면 한 달에 열두 번이다.

import OpenAI from "openai";
import type { CrossReviewNote, LetterBlock } from "./types";
import { BLOCK_LABEL } from "./types";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

const SYSTEM_INSTRUCTIONS = `당신은 한국어 연구·보건 뉴스레터의 교정자다. 글을 고치지 않고 문제만 지적한다.

원천 초록과 레터 본문을 받는다. 찾을 것은 세 가지다.

1. unsourced  — 원천 초록에 근거가 없는 사실 주장
2. advice     — 의학적 지시로 읽힐 문장 ("복용하십시오", "치료됩니다", 용량 제시)
3. coherence  — 앞뒤 연결이 끊긴 곳

# 규칙
- 문제가 없으면 빈 배열을 반환한다. 억지로 만들지 않는다.
- 문장을 고쳐 주지 않는다. 무엇이 문제인지만 한 문장으로 쓴다.
- 한국어로 쓴다. 조사와 어미를 갖춘 완전한 문장으로 쓴다.
- 지적은 많아도 6개까지만 한다. 중요한 것부터 쓴다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "notes": [ { "kind": "unsourced", "blockIndex": 4, "message": "..." } ] }

blockIndex 는 본문에 붙은 번호를 그대로 쓴다. 특정할 수 없으면 null 로 둔다.`;

export async function runCrossReview(input: {
  title: string;
  blocks: LetterBlock[];
  sourceAbstracts: string[];
}): Promise<CrossReviewNote[]> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const err = new Error("ZAI_API_KEY 없음 · 교차 리뷰를 부를 수 없습니다");
    (err as { status?: number }).status = 503;
    throw err;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });

  const body = input.blocks
    .map((b, i) => `[${i}] ${BLOCK_LABEL[b.kind]}\n${b.text || "(비어 있음)"}`)
    .join("\n\n");

  const abstracts =
    input.sourceAbstracts.filter(Boolean).join("\n\n---\n\n") || "(원천 초록 없음)";

  const response = await client.chat.completions.create({
    model: process.env.ZAI_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      {
        role: "user",
        content: `# 원천 초록\n${abstracts}\n\n# 레터 제목\n${input.title}\n\n# 레터 본문\n${body}`,
      },
    ],
    // @ts-expect-error z.ai 확장 파라미터 · OpenAI SDK 타입에는 없으나 서버는 수용
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("교차 리뷰 응답이 비었습니다");

  return parseNotes(content, input.blocks.length);
}

const KINDS = new Set(["unsourced", "advice", "coherence"]);

function parseNotes(raw: string, blockCount: number): CrossReviewNote[] {
  const json = raw.trim().replace(/^```(?:json)?\n?|\n?```$/g, "");

  let parsed: { notes?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("교차 리뷰 응답이 JSON 이 아닙니다");
  }
  if (!Array.isArray(parsed.notes)) return [];

  return parsed.notes
    .flatMap((n): CrossReviewNote[] => {
      if (typeof n !== "object" || n === null) return [];
      const { kind, message, blockIndex } = n as Record<string, unknown>;
      if (typeof kind !== "string" || !KINDS.has(kind)) return [];
      if (typeof message !== "string" || !message.trim()) return [];

      const index =
        typeof blockIndex === "number" && blockIndex >= 0 && blockIndex < blockCount
          ? blockIndex
          : null;

      return [
        {
          kind: kind as CrossReviewNote["kind"],
          message: message.trim(),
          blockIndex: index,
        },
      ];
    })
    .slice(0, 6);
}

export const CROSS_REVIEW_KIND_LABEL: Record<CrossReviewNote["kind"], string> = {
  unsourced: "원천에 없는 주장",
  advice: "의학적 지시로 읽힘",
  coherence: "앞뒤 연결이 끊김",
};
