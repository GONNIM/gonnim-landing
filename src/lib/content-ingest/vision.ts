// z.ai GLM Vision — 이미지 → 텍스트/설명 추출
//
// 모델: glm-4.6v-flash (기본 · 저렴·빠름)
// 형식: OpenAI 호환 · messages content 배열에 image_url 전달
// 이미지 제약: 5MB 이하 · 6000x6000 이하 · jpg/png/jpeg
// 용도: Threads/Instagram 등 스크린샷 게시물의 텍스트 추출

import OpenAI from "openai";

const DEFAULT_VISION_MODEL = "glm-4.6v-flash";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

const SYSTEM_PROMPT = `당신은 소셜미디어(Threads·Instagram 등) 이미지 게시물의 텍스트 추출 어시스턴트입니다.

# 작업
- 이미지에 포함된 모든 텍스트를 정확히 읽어 그대로 추출
- 텍스트가 없거나 인식 불가하면 이미지 내용을 한국어로 짧게 묘사

# 원칙
- 원문 그대로 (추측·요약·재구성 금지)
- 여러 줄 텍스트는 줄바꿈 유지
- 한글·영문·기호 모두 원본 유지
- 존재하지 않는 내용 창작 금지

# 응답 형식
JSON: { "text": "추출된 텍스트 또는 이미지 설명", "kind": "text" | "description" }
- kind=text: 이미지에 있던 텍스트를 그대로 옮긴 경우
- kind=description: 텍스트 없어서 이미지 내용을 묘사한 경우
`;

export type VisionResult = {
  text: string;
  kind: "text" | "description";
  model: string;
};

export type VisionOptions = {
  model?: string;
  prompt?: string;
};

export async function extractTextFromImage(
  imageUrl: string,
  options: VisionOptions = {},
): Promise<VisionResult> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const err = new Error("ZAI_API_KEY missing · .env.local 또는 Vercel 환경변수 등록 필요");
    (err as { status?: number }).status = 503;
    throw err;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });

  const model = options.model || DEFAULT_VISION_MODEL;
  const userPrompt = options.prompt || "이 이미지의 텍스트를 추출하거나, 텍스트가 없으면 이미지를 한국어로 짧게 묘사하세요.";

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    // @ts-expect-error z.ai 확장 파라미터
    thinking: { type: "disabled" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("GLM Vision 응답이 비어 있음");
  }

  return parseVisionJson(raw, model);
}

function parseVisionJson(raw: string, model: string): VisionResult {
  const jsonText = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonText) as {
    text?: unknown;
    kind?: unknown;
  };
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const kindRaw = typeof parsed.kind === "string" ? parsed.kind : "text";
  const kind: "text" | "description" = kindRaw === "description" ? "description" : "text";
  if (!text) {
    throw new Error("GLM Vision 응답에서 text 필드를 찾을 수 없음");
  }
  return { text, kind, model };
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  throw new Error("GLM Vision 응답에서 JSON 페이로드를 추출할 수 없음");
}
