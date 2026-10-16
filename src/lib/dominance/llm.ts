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
import Anthropic from "@anthropic-ai/sdk";

// 44차 · 환경변수 끝의 줄바꿈 · 공백을 자른다(29차에 Vercel 값 끝에 줄바꿈이 붙어 가격표 짝을 못 찾고 비용이 0 으로 기록됐다).
export const MODEL_MAIN = process.env.DS_MODEL?.trim() || "glm-5.3";
export const MODEL_LIGHT = process.env.DS_MODEL_LIGHT?.trim() || "glm-5.3-flash";
export const BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
/** 추론 강도 · z.ai glm-5.3 안내의 reasoning_effort("low" | "high" | "max") */
export const REASONING_EFFORT = "low";

// 61차 A · D51 · 추천은 Anthropic → OpenAI → GLM main 순서로 부른다. 키가 없거나 실패하면 다음 공급자로 넘어간다.
export const ANTHROPIC_MODEL = process.env.DS_ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
/** 키 · ANTHROPIC_API_KEY 를 먼저 읽고, 없으면 철자가 다른 ANTHROPHIC_API_KEY 를 읽는다(그때는 서버 로그에 경고 한 줄) */
let warnedSpelling = false;
function anthropicKey(): string | null {
  const right = process.env.ANTHROPIC_API_KEY?.trim();
  if (right) return right;
  const typo = process.env.ANTHROPHIC_API_KEY?.trim();
  if (typo && !warnedSpelling) {
    warnedSpelling = true;
    console.warn("[dominance] ANTHROPIC_API_KEY 가 없어 철자가 다른 ANTHROPHIC_API_KEY 를 읽었습니다. 이름을 ANTHROPIC_API_KEY 로 고치십시오.");
  }
  return typo || null;
}
export function anthropicReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPHIC_API_KEY?.trim());
}

// 50차 A · D51 · 제목 · 한 문장 요약 추천만 OpenAI API 가 한다(48차 Anthropic 에서 바꿈). 키가 없으면 그 기능이 꺼진다.
// 기본 모델: GPT-6 계열의 중간 등급 gpt-6.1-sol(developers.openai.com/api/docs/models · 2026-10-05 읽음).
// 이 계열에는 "mini" 이름의 모델이 없다(Astra · Sol · Luna). 바꿀 때는 DS_OPENAI_MODEL.
export const OPENAI_MODEL = process.env.DS_OPENAI_MODEL?.trim() || "gpt-6.1-sol";
export function openaiReady(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

// 27차 D · 편집자 호출 시험용 두 번째 공급자. 지금은 시험에서만 쓴다.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export type Tier = "main" | "light";

/** 가격 · 백만 토큰당 달러(docs.z.ai 가격표 · 2026-10-01 확인). 감사 기록의 비용 계산용 · 캐시 할인은 빼고 센다 */
const PRICE: Record<string, { input: number; output: number }> = {
  "glm-5.3": { input: 1.4, output: 4.4 },
  "glm-5.3-flash": { input: 0.15, output: 0.5 },
  "glm-5.3-flashx": { input: 0.37, output: 1.25 },
  "glm-5.2": { input: 1.4, output: 4.4 },
  // 50차 · OpenAI 가격표(developers.openai.com/api/docs/pricing · openai.com/api/pricing 이 넘겨주는 곳 · 2026-10-05 · Standard · 짧은 문맥)
  "gpt-6.1-sol": { input: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6-astra": { input: 10, output: 50 },
  // 61차 · Anthropic 가격표(platform.claude.com/docs/en/about-claude/pricing · 2026-10-16 읽음 · 기본 입력 · 출력)
  // Sonnet 5 의 $2/$10 은 도입가였으나 지금은 표준가다(같은 쪽 각주 3 · 9/1 인상은 하지 않음)
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** 한 호출의 추정 비용(달러). 가격표에 없는 모델이면 null */
export function costOf(u: { input: number; output: number; model: string }): number | null {
  const p = PRICE[u.model];
  return p ? (u.input * p.input + u.output * p.output) / 1e6 : null;
}
export type Provider = "zai" | "groq" | "openai" | "anthropic";
export type Usage = { input: number; output: number; reasoning: number; model: string; ms: number; /** 50차 · 응답이 알려 준 모델 이름(요청 이름과 다를 수 있음) */ served?: string };

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
  if (provider === "openai") return OPENAI_MODEL;
  if (provider === "anthropic") return ANTHROPIC_MODEL;
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
  /** 36차 B · 호출 기록에 남길 단계 이름. 없으면 unknown */
  stage?: string;
}): Promise<string> {
  if (input.provider === "openai") return chatOpenAI(input);
  if (input.provider === "anthropic") return chatAnthropic(input);
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
  // 36차 B · 호출마다 한 줄(시각 · 단계 · 모델 · 토큰 · 시간 · 비용). 실패해도 본 호출은 계속
  const { logLlmCall } = await import("./runlog");
  await logLlmCall({ stage: input.stage ?? "unknown", model, input: used.input, output: used.output, reasoning: used.reasoning, ms: used.ms, cost: costOf(used) });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM 응답이 비었습니다");
  return content;
}

/**
 * 50차 A · OpenAI 호출 하나(api.openai.com · 키 OPENAI_API_KEY). JSON 은 response_format json_object 로 받는다.
 * gpt-6.1-sol 은 추론 모델이라 max_tokens 대신 max_completion_tokens(추론 토큰 포함)와 reasoning_effort "low" 를 쓰고 temperature 는 보내지 않는다.
 * 호출 기록은 llm-calls 로그에 provider "openai" 로 남긴다.
 */
async function chatOpenAI(input: { system: string; user: string; maxTokens: number; usage?: (u: Usage) => void; stage?: string }): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY 없음 · 제목 · 요약 추천을 쓸 수 없습니다");
    (err as { status?: number }).status = 503;
    throw err;
  }
  const client = new OpenAI({ apiKey });
  const model = OPENAI_MODEL;
  const t0 = Date.now();
  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: input.maxTokens + 4000,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${input.system}\n\n응답은 JSON 하나만 낸다.` },
      { role: "user", content: input.user },
    ],
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
  const u = response.usage as
    | { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
    | undefined;
  const used: Usage = {
    input: u?.prompt_tokens ?? 0,
    output: u?.completion_tokens ?? 0,
    reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
    model,
    ms: Date.now() - t0,
    served: response.model,
  };
  input.usage?.(used);
  meter?.(used);
  const { logLlmCall } = await import("./runlog");
  await logLlmCall({ stage: input.stage ?? "unknown", provider: "openai", model, input: used.input, output: used.output, reasoning: used.reasoning, ms: used.ms, cost: costOf(used) });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI 응답이 비었습니다");
  return content;
}

/**
 * 61차 A · Anthropic 호출 하나. JSON 모드가 없으므로 지시문 끝에 「JSON 하나만 낸다」를 붙이고 응답 글을 그대로 돌려준다.
 * 호출 기록은 llm-calls 로그에 provider "anthropic" 으로 남긴다.
 */
async function chatAnthropic(input: { system: string; user: string; maxTokens: number; usage?: (u: Usage) => void; stage?: string }): Promise<string> {
  const apiKey = anthropicKey();
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY 없음");
    (err as { status?: number }).status = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey });
  const model = ANTHROPIC_MODEL;
  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: input.maxTokens,
    system: `${input.system}\n\nJSON 하나만 낸다. 앞뒤에 다른 글이나 코드 블록 표시를 붙이지 않는다.`,
    messages: [{ role: "user", content: input.user }],
  });
  const used: Usage = { input: response.usage.input_tokens, output: response.usage.output_tokens, reasoning: 0, model, ms: Date.now() - t0, served: response.model };
  input.usage?.(used);
  meter?.(used);
  const { logLlmCall } = await import("./runlog");
  await logLlmCall({ stage: input.stage ?? "unknown", provider: "anthropic", model, input: used.input, output: used.output, reasoning: 0, ms: used.ms, cost: costOf(used) });
  const content = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  if (!content.trim()) throw new Error("Anthropic 응답이 비었습니다");
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
    /** 35차 D · 다시 부른 기록에 남길 단계 이름(제안 · 검증 · 배정 · 고르기 · 용어표 · 쓰기 · 이슈 만들기 …). 없으면 unknown */
    stage?: string;
  },
): Promise<unknown> {
  let last = "";
  const { stage } = opts;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chat({ system, user, maxTokens, ...opts, stage: attempt === 0 ? stage : `${stage ?? "unknown"}(다시)` });
    try {
      return JSON.parse(content.trim().replace(/^```(?:json)?\n?|\n?```$/g, ""));
    } catch {
      last = content;
      if (attempt === 0) {
        jsonRetries++;
        // 35차 D · 다시 부를 때 한 줄을 남긴다(실패해도 본 호출은 계속)
        const { logJsonRetry } = await import("./runlog");
        await logJsonRetry({ model: modelFor(opts.tier, opts.provider), stage: stage ?? "unknown", head: content });
      }
    }
  }
  throw new Error(`LLM 응답이 JSON 이 아닙니다 (길이 ${last.length} · 앞: ${last.slice(0, 80)} · 끝: ${last.slice(-80)})`);
}

/**
 * 61차 A · D51 · Anthropic → OpenAI → GLM main 순서로 부른다. 앞 단계가 어떤 오류로든 실패하면 같은 지시문으로 다음 단계를 부른다.
 * 모든 호출은 llm-calls 로그에 남는다(chat 이 남김 · 실패한 Anthropic · OpenAI 호출도 토큰 0 으로 한 줄).
 * 결과에 답한 단계와 앞 단계들의 짧은 실패 이유(failures)를 넣는다. 모두 실패하면 이유를 모아 던진다.
 */
export type FallbackProvider = "anthropic" | "openai" | "zai";
export const PROVIDER_LABEL: Record<FallbackProvider, string> = { anthropic: "Anthropic", openai: "OpenAI", zai: "GLM" };
export type FallbackResult = {
  data: unknown;
  provider: FallbackProvider;
  model: string;
  fallback: boolean;
  /** 앞 단계 실패 · 순서대로 */
  failures: { provider: FallbackProvider; reason: string }[];
  /** 54차 호환 · 첫 실패 이유 */
  firstError: string | null;
};

/** 공급자 오류를 짧은 글자로(화면 · 기록용) */
export function shortProviderError(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string; error?: { error?: { type?: string; message?: string } } };
  const msg = String(e?.message ?? err ?? "");
  const type = String(e?.error?.error?.type ?? e?.code ?? "");
  if (/_API_KEY 없음/.test(msg)) return "키 없음";
  if (e?.status === 401 || type === "authentication_error") return "키 틀림";
  if (/credit balance|credits|billing|insufficient_quota|credit_balance/i.test(msg + type) || e?.status === 402) return "키 맞음 · 잔액 없음";
  if (e?.status === 404 || type === "not_found_error" || /does not exist|model_not_found/i.test(msg)) return "모델 이름 오류";
  if (e?.status === 429) return "요청 한도";
  if (e?.status && e.status >= 500) return `서버 오류 ${e.status}`;
  return `${e?.status ?? "네트워크"} ${String(type || msg).slice(0, 40)}`.trim();
}
/** 54차 이름 · 그대로 둔다 */
export const shortOpenAIError = shortProviderError;

export async function callJsonWithFallback(
  system: string,
  user: string,
  maxTokens: number,
  opts: { stage: string; usage?: (u: Usage) => void },
): Promise<FallbackResult> {
  let served: string | null = null;
  const usage = (u: Usage) => {
    served = u.served ?? u.model;
    opts.usage?.(u);
  };
  const failures: FallbackResult["failures"] = [];
  const order: FallbackProvider[] = ["anthropic", "openai", "zai"];
  const { logLlmCall } = await import("./runlog");
  for (const provider of order) {
    served = null;
    const stage = failures.length ? `${opts.stage}(${PROVIDER_LABEL[provider]} 대체)` : opts.stage;
    try {
      const data = await callJson(system, user, maxTokens, { tier: "main", provider, stage, usage });
      return { data, provider, model: served ?? modelFor("main", provider), fallback: failures.length > 0, failures, firstError: failures[0]?.reason ?? null };
    } catch (err) {
      const reason = shortProviderError(err);
      failures.push({ provider, reason });
      // 실패한 호출도 한 줄 남긴다(토큰 0 · 비용 0 · 단계에 이유)
      if (provider !== "zai") await logLlmCall({ stage: `${stage}(실패 · ${reason})`, provider, model: modelFor("main", provider), input: 0, output: 0, reasoning: 0, ms: 0, cost: 0 });
    }
  }
  throw new Error(failures.map((f) => `${PROVIDER_LABEL[f.provider]}(${f.reason})`).join(" · ") + " 모두 실패");
}

/** 추천 단추를 열 수 있는가(Anthropic · OpenAI · GLM 키 중 하나) */
export function suggestReady(): boolean {
  return anthropicReady() || openaiReady() || Boolean(process.env.ZAI_API_KEY?.trim());
}
