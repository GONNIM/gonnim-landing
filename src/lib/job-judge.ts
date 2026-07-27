// 채용공고 LLM 판정 · 사용자 자산 매치 · z.ai GLM-5.2
// P-Job-Judge · Sprint W1 · Q4-Step4
//
// 목적: 채용공고 (title + main_tasks + skill_tags) → 사용자 자산 매치도 판정 (A/B/C/D)
// 시장 요구 signal 도출: 채용 요구사항 = 기업이 지금 필요로 하는 것 = 사업화 signal
//
// 응답: { llm_market_signal, llm_user_asset_match, llm_business_grade }

import OpenAI from "openai";
import { GTM_ASSETS } from "./gtm-assets";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

export type JobJudgeInput = {
  title: string;
  company: string;
  company_industry: string | null;
  main_tasks: string | null;
  requirements: string | null;
  preferred_points: string | null;
  skill_tags: string[];
  external_url: string;
};

export type BusinessGrade = "A" | "B" | "C" | "D";

export type JobJudgeResult = {
  marketSignal: string;
  userAssetMatch: string;
  grade: BusinessGrade | null;
};

const SYSTEM_INSTRUCTIONS = `당신은 22년차 풀사이클 시니어 엔지니어 홍해연의 시장 분석·사업 발굴 어시스턴트입니다.

# 목적
채용공고 (title + 주요업무 + 자격요건 + 기술 스택) 를 분석하여 · 다음 2가지 판정:
1. **시장 요구 signal**: 이 채용이 드러내는 시장 pain·요구 (2~3문장 · 구체적)
2. **사용자 자산 매치**: 사용자 자산이 이 시장 요구에 얼마나 매치되는가 (A/B/C/D)

# 원칙
- 채용은 지원 대상 X · **시장 signal 원천** · 이 회사가 지금 필요로 하는 것 = 시장이 지금 요구하는 것
- 사용자 자산 매치 = **사업화 signal** · 유사 pain 다른 기업 대상 · 사용자가 서비스·컨설팅·제품 제공 가능한가

# 판정 기준 (엄격)
- **A**: 사용자 자산 극정합 (Pocket RAG · Local LLM · Multi-Agent · MCP · 비정형 문서 파싱 · 도메인 특화 챗봇) + 시장 pain 명확
- **B**: 사용자 자산 부분 정합 (일반 백엔드·풀스택·데이터·인프라 기술 스택) + 시장 pain 존재
- **C**: 시장 pain 있으나 사용자 자산 정합 낮음 (특수 도메인·특정 프레임워크·시니어 부합 어려운 스킬)
- **D**: 사용자 자산 무관 (프론트엔드·모바일·게임·마케팅·비-엔지니어링 등)

# 응답 형식 (엄수 · JSON 만)
{
  "llm_market_signal": "이 채용이 드러내는 시장 pain·요구 (2~3문장)",
  "llm_user_asset_match": "사용자 자산 매치 근거 (1~2문장 · 어떤 자산이 어떻게 매치되는지)",
  "llm_business_grade": "A|B|C|D"
}
`;

export async function judgeJob(input: JobJudgeInput): Promise<JobJudgeResult> {
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

  const systemContent = `${SYSTEM_INSTRUCTIONS}\n\n# 사용자 GTM 자원 (매치 필터)\n\n${GTM_ASSETS}`;

  const truncate = (s: string | null, n: number) =>
    s ? (s.length > n ? s.slice(0, n) + "…" : s) : "(없음)";

  const userContent = `채용공고:
- 회사: ${input.company} (${input.company_industry ?? "-"})
- 제목: ${input.title}
- 기술 스택: ${input.skill_tags.length > 0 ? input.skill_tags.join(", ") : "-"}
- URL: ${input.external_url}

## 주요업무
${truncate(input.main_tasks, 1500)}

## 자격요건
${truncate(input.requirements, 1000)}

## 우대사항
${truncate(input.preferred_points, 800)}

위 정보로 · 시장 signal + 사용자 자산 매치 판정 JSON 반환.`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    // @ts-expect-error z.ai 확장
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("GLM 응답에서 텍스트 없음");

  const parsed = JSON.parse(extractJson(content)) as {
    llm_market_signal?: string;
    llm_user_asset_match?: string;
    llm_business_grade?: string;
  };

  const rawGrade = (parsed.llm_business_grade ?? "").toUpperCase().trim();
  const grade: BusinessGrade | null =
    rawGrade === "A" || rawGrade === "B" || rawGrade === "C" || rawGrade === "D"
      ? (rawGrade as BusinessGrade)
      : null;

  return {
    marketSignal: typeof parsed.llm_market_signal === "string" ? parsed.llm_market_signal : "",
    userAssetMatch: typeof parsed.llm_user_asset_match === "string" ? parsed.llm_user_asset_match : "",
    grade,
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
