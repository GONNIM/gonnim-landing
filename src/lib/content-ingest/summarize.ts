// z.ai GLM-5.2 요약·인사이트 · Personal Ingest 전용
//
// 개인 인사이트 수집용 프롬프트 (Sprint Radar insight-generator 와는 다른 성격).
// 짧고 실용 · 요약 3줄 + 인사이트 3~5 + 태그 3~5 + 도메인 1개.

import OpenAI from "openai";
import type { ExtractedContent, SummarizeResult } from "./types";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

const SYSTEM_PROMPT = `당신은 홍해연의 개인 인사이트 큐레이터입니다.
사용자가 붙여넣은 URL·텍스트·메일 콘텐츠를 짧고 실용적으로 정리합니다.

# 출력 원칙
- 존댓말·한국어
- 원문에 없는 내용 추측·창작 금지
- 개발자·트레이더·부업 창업자 관점에서 실용 가치 있는 부분 우선

# 도메인 분류 (1개만 · 소문자 태그)
- trading (주식·코인·자동매매·투자)
- dev (개발·기술·AI·LLM·인프라)
- design (디자인·UI/UX)
- business (사업·마케팅·영업·GTM)
- productivity (생산성·워크플로우·툴)
- learning (학습·강의·책·논문)
- news (시사·뉴스)
- misc (위 카테고리 어디에도 정합 안 됨)

# 태그
- 3~5개 · 소문자 · 한글·영문 혼용 가능 · 공백 없음 (예: rag · llm · fastapi · 부업 · 크몽)

# 출력 형식 (JSON 만 · 다른 설명 없음)
{
  "summary": ["1줄 요약", "1줄 요약", "1줄 요약"],
  "insights": ["실용 인사이트 1", "실용 인사이트 2", "실용 인사이트 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "domain": "trading|dev|design|business|productivity|learning|news|misc"
}

- summary: 정확히 3줄 (각 40자 이내)
- insights: 3~5개 (각 60자 이내 · 원문 근거 · 실행 가능한 형태 우선)
- tags: 3~5개
- domain: 위 8개 중 1개
`;

export type SummarizeOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export async function summarize(
  content: ExtractedContent,
  options: SummarizeOptions = {},
): Promise<SummarizeResult> {
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

  const model = options.model || process.env.ZAI_MODEL || DEFAULT_MODEL;
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 2000;

  const userBlock = buildUserBlock(content);

  const response = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userBlock },
    ],
    // @ts-expect-error z.ai 확장 파라미터 (thinking 비활성)
    thinking: { type: "disabled" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("GLM 응답에서 텍스트 콘텐츠를 찾을 수 없음");
  }

  return parseSummarizeJson(raw);
}

function buildUserBlock(c: ExtractedContent): string {
  const meta: string[] = [];
  if (c.title) meta.push(`제목: ${c.title}`);
  if (c.author) meta.push(`작성자: ${c.author}`);
  if (c.published) meta.push(`발행: ${c.published}`);
  if (c.url) meta.push(`URL: ${c.url}`);
  meta.push(`출처 유형: ${c.source}`);

  return `${meta.join("\n")}

# 원문
${c.text}`;
}

function parseSummarizeJson(raw: string): SummarizeResult {
  const jsonText = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonText) as {
    summary?: unknown;
    insights?: unknown;
    tags?: unknown;
    domain?: unknown;
  };

  const summary = ensureStringArray(parsed.summary, "summary");
  const insights = ensureStringArray(parsed.insights, "insights");
  const tags = ensureStringArray(parsed.tags, "tags");
  const domain = typeof parsed.domain === "string" ? parsed.domain.trim() : "misc";

  return { summary, insights, tags, domain, raw };
}

function ensureStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) {
    throw new Error(`GLM 응답의 ${field} 가 배열이 아님`);
  }
  return v.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  throw new Error("GLM 응답에서 JSON 페이로드를 추출할 수 없음");
}
