// IT 트렌드 launch 사업화 signal 판정 · z.ai GLM-5.2
// P-LLM-Judge · Sprint W1
//
// insight-generator (프리랜서 프로젝트 7섹션 상세) 와 별개.
// Trend launch 는 짧은 정보 (title+tagline) · 잦은 판정 · 간결한 등급 판정.
//
// 응답: { llm_business_grade, llm_market_pain, reasoning }

import OpenAI from "openai";
import { GTM_ASSETS } from "./gtm-assets";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

export type TrendJudgeInput = {
  source: string;
  title: string;
  tagline: string | null;
  author: string | null;
  published_at: string | null;
  external_url: string;
};

export type BusinessGrade = "A" | "B" | "C" | "D";

export type TrendJudgeResult = {
  grade: BusinessGrade | null;
  marketPain: string;
  reasoning: string;
};

const SYSTEM_INSTRUCTIONS = `당신은 22년차 풀사이클 시니어 엔지니어 홍해연의 사업화 발굴 어시스턴트입니다.

# 목적
IT 트렌드 launch (Product Hunt · 인디해커 등) 를 사용자 자원 관점에서 사업화 signal 로 판정.
짧은 정보 (title + tagline · 1~2문장) 만 있음 · 실 웹 검증 없이 판단 · 정보 부족 시 D.

# 판정 기준 (엄격 · GTM 자원 이중 필터)
- **A**: 시장 검증 강 (다수 유사 SaaS · 실 매출 signal · 확실한 pain) + 사용자 자산 정합 강 (Local LLM · RAG · 정부·공공 조달 · 프리랜서 마켓플레이스 진입 가능)
- **B**: 시장 검증 있음 + 자원 중 정합 (프리랜서 계약형 or 랜딩 유도 가능 · 이 도메인 사용자 자산 부분 정합)
- **C**: 시장 존재하나 사용자 자원 약 정합 (콜드·레퍼럴 필수 · 도메인 네트워크 필요 · 대형 자본 필요)
- **D**: 시장 미검증 or 사용자 자산 정합 없음 or 정보 부족

# 판정 원칙
- 냉정 판단: **A 등급 매우 엄격 적용** · 대부분은 C/D
- 시장 pain 을 명확히 서술: 이 launch 가 어떤 pain 을 해결하는가
- 판정 근거 명시: 왜 이 등급인가 · 사용자 자원 정합 관점

# 응답 형식 (엄수)
JSON 만 반환 · 다른 텍스트 없음:
{
  "llm_business_grade": "A|B|C|D",
  "llm_market_pain": "이 launch 가 다루는 시장 pain (1~2문장 · 구체적)",
  "reasoning": "판정 근거 (1~2문장 · 시장 검증 + 자원 정합 관점)"
}
`;

export async function judgeTrendLaunch(
  input: TrendJudgeInput,
): Promise<TrendJudgeResult> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const err = new Error("ZAI_API_KEY missing · .env.local 등록 필요");
    (err as { status?: number }).status = 503;
    throw err;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });
  const model = process.env.ZAI_MODEL || DEFAULT_MODEL;

  // system 은 static (캐시 hit) · user 만 다름
  const systemContent = `${SYSTEM_INSTRUCTIONS}\n\n# 사용자 GTM 자원 (판정 필터)\n\n${GTM_ASSETS}`;

  const userContent = `IT 트렌드 launch 정보:
- 원천: ${input.source}
- Title: ${input.title}
- Tagline: ${input.tagline ?? "(없음)"}
- Author: ${input.author ?? "-"}
- Published: ${input.published_at ?? "-"}
- URL: ${input.external_url}

위 정보만으로 사업화 signal 판정 JSON 반환.`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    // @ts-expect-error z.ai 확장 · thinking 비활성 (빠른 응답)
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("GLM 응답에서 텍스트 없음");

  const parsed = JSON.parse(extractJson(content)) as {
    llm_business_grade?: string;
    llm_market_pain?: string;
    reasoning?: string;
  };

  const rawGrade = (parsed.llm_business_grade ?? "").toUpperCase().trim();
  const grade: BusinessGrade | null =
    rawGrade === "A" || rawGrade === "B" || rawGrade === "C" || rawGrade === "D"
      ? (rawGrade as BusinessGrade)
      : null;

  return {
    grade,
    marketPain: typeof parsed.llm_market_pain === "string" ? parsed.llm_market_pain : "",
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0) return raw;
  return raw.slice(first, last + 1);
}
