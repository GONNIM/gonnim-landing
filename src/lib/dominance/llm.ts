// 지배상식의 LLM 설정과 호출 · 모델 이름은 이 파일 한 곳에만 둔다 (D46 · 28차).
//
// - main  (glm-5.3)       : ②-2 쓰기 · ④ 교차 리뷰 · 편집자 호출 시험
// - light (glm-5.3-flash) : ⓪-1 제안 · 이슈 만들기 채우기 · ⓪-2 V2 관련도 · 검색어 다시 쓰기 ·
//                           ① 배정(칸 · 관련도 · 뜻) · 본문 정설 · 산업 단서 · ②-1 뜻 · ②-2 고르기 · 용어표
// 운영자는 DS_MODEL · DS_MODEL_LIGHT 두 환경변수로 바꾼다(런북 17). ZAI_MODEL 은 지배상식 밖 기능이 읽는 변수이며 여기서는 읽지 않는다(29차).
//
// GLM-5.3 계열은 추론을 끌 수 없다(thinking:disabled 를 보내면 400). 그래서 추론 강도를
// reasoning_effort "low" 로 고정한다. 기본값이 "max" 여서 지정하지 않으면 느리고 비싸진다.
// 추론 글은 message.reasoning_content 로 따로 오므로 JSON 은 message.content 만 읽는다.

import OpenAI from "openai";

export const MODEL_MAIN = process.env.DS_MODEL || "glm-5.3";
export const MODEL_LIGHT = process.env.DS_MODEL_LIGHT || "glm-5.3-flash";
export const BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
/** 추론 강도 · z.ai glm-5.3 안내의 reasoning_effort("low" | "high" | "max") */
export const REASONING_EFFORT = "low";

// 27차 D · 편집자 호출 시험용 두 번째 공급자. 지금은 시험에서만 쓴다.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export type Tier = "main" | "light";
export type Provider = "zai" | "groq";
export type Usage = { input: number; output: number; reasoning: number; model: string; ms: number };

// 시험 스크립트가 모든 호출의 시간 · 토큰을 모으려고 건다. 평소에는 비어 있다.
let meter: ((u: Usage) => void) | null = null;
export function setUsageMeter(fn: ((u: Usage) => void) | null) {
  meter = fn;
}

/**
 * 추론 설정. glm-5.3 계열은 끌 수 없으므로 reasoning_effort "low".
 * glm-5.2 이하로 되돌릴 때(DS_MODEL=glm-5.2)는 예전처럼 추론을 끈다 — 그 모델은 reasoning_effort 를 모른다.
 */
function reasoningParams(model: string): object {
  const legacy = /^glm-(4\.|5$|5-|5\.[0-2](\D|$))/.test(model);
  return legacy ? { thinking: { type: "disabled" } } : { reasoning_effort: REASONING_EFFORT };
}

export function modelFor(tier: Tier, provider: Provider = "zai"): string {
  if (provider === "groq") return GROQ_MODEL;
  return tier === "main" ? MODEL_MAIN : MODEL_LIGHT;
}

/** 호출 하나 · JSON 모드 · 응답 글(content)을 그대로 돌려준다. */
export async function chat(input: {
  system: string;
  user: string;
  maxTokens: number;
  tier: Tier;
  temperature?: number;
  provider?: Provider;
  usage?: (u: Usage) => void;
}): Promise<string> {
  const groq = input.provider === "groq";
  const keyName = groq ? "GROQ_API_KEY" : "ZAI_API_KEY";
  const apiKey = process.env[keyName];
  if (!apiKey) {
    const err = new Error(`${keyName} 없음 · LLM 을 부를 수 없습니다`);
    (err as { status?: number }).status = 503;
    throw err;
  }
  const client = new OpenAI({ apiKey, baseURL: groq ? GROQ_BASE_URL : BASE_URL });
  const model = modelFor(input.tier, input.provider);

  const t0 = Date.now();
  const response = await client.chat.completions.create({
    model,
    temperature: input.temperature ?? 0.4,
    max_tokens: input.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    // z.ai 확장 파라미터 · Groq 에는 보내지 않는다.
    ...(groq ? {} : reasoningParams(model)),
  });

  const u = response.usage as
    | { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
    | undefined;
  const used: Usage = {
    input: u?.prompt_tokens ?? 0,
    output: u?.completion_tokens ?? 0,
    reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
    model,
    ms: Date.now() - t0,
  };
  input.usage?.(used);
  meter?.(used);
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM 응답이 비었습니다");
  return content;
}

/** 28차 시험에서 JSON 이 깨져 다시 부른 횟수(시험 보고용) */
export let jsonRetries = 0;

/**
 * chat 을 부르고 JSON 으로 읽는다. 코드 블록(```json)이 섞여 와도 벗겨 낸다.
 * JSON 이 깨져 오면 한 번만 다시 부른다(28차 실측: glm-5.3-flash 가 고르기에서 한 번 깨진 JSON 을 냈다).
 */
export async function callJson(
  system: string,
  user: string,
  maxTokens: number,
  opts: {
    tier: Tier;
    temperature?: number;
    usage?: (u: Usage) => void;
    provider?: Provider;
  },
): Promise<unknown> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chat({ system, user, maxTokens, ...opts });
    try {
      return JSON.parse(content.trim().replace(/^```(?:json)?\n?|\n?```$/g, ""));
    } catch {
      last = content;
      if (attempt === 0) jsonRetries++;
    }
  }
  throw new Error(`LLM 응답이 JSON 이 아닙니다 (길이 ${last.length} · 앞: ${last.slice(0, 80)} · 끝: ${last.slice(-80)})`);
}
