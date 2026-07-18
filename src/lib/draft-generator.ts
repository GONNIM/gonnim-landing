// z.ai GLM-5.2 powered draft proposal generator.
//
// Uses the OpenAI SDK against z.ai's OpenAI-compatible endpoint.
// - Base URL: https://api.z.ai/api/paas/v4
// - Model:    glm-5.2 (1M context · 128K max output · JSON structured output)
// - Auth:     Bearer $ZAI_API_KEY
//
// Prompt caching: z.ai supports automatic context caching. We keep the
// system + user profile at the top of the prompt so cache hits stay high
// across repeated calls in the same session.
//
// Docs: https://docs.z.ai/guides/llm/glm-5.2
//       https://docs.z.ai/api-reference/llm/chat-completion

import OpenAI from "openai";
import { USER_PROFILE } from "./radar-user-profile";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

export type ProjectContext = {
  channel: string;
  title: string;
  description: string | null;
  category: string | null;
  skills: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  duration_days: number | null;
  work_type: string | null;
  contract_type: string | null;
  location: string | null;
  external_url: string;
};

export type DraftResult = {
  proposal: string;
  suggestedBudget: number | null;
  suggestedDurationDays: number | null;
};

const SYSTEM_INSTRUCTIONS = `당신은 22년차 풀사이클 시니어 엔지니어(홍해연)를 대리하여 프리랜서 플랫폼(원티드 긱스, 위시켓 등)에 지원할 제안서 초안을 작성하는 전문가입니다.

# 목표
- 프로젝트 요구사항을 정확히 파악하고, 사용자의 실제 실적을 근거로 신뢰감 있는 제안서 초안을 작성합니다.
- 실적을 나열하기보다, 이 프로젝트에 왜 사용자가 적합한지 논리적으로 연결합니다.
- 첫 3초 안에 스캔 가능하도록 시각적으로 명료한 형식으로 작성합니다.

# 출력 형식 (엄수)
반드시 다음 JSON 형식으로만 응답하세요. 다른 설명·마크다운 없이 JSON만 반환:
{
  "proposal": "제안서 본문 (700~1400자 · 한국어 · 존댓말 · 아래 6섹션 형식)",
  "suggested_budget": 원_단위_정수_또는_null,
  "suggested_duration_days": 정수_또는_null
}

# proposal 형식 (엄수)
반드시 아래 6개 섹션 헤더를 그대로 사용하고, 각 섹션 사이에 빈 줄(\\n\\n)을 삽입합니다:

▎프로젝트 이해
(1~3문장 · 인사 + 프로젝트 요약 + 사용자 강점의 연결점)

▎핵심 적합성 · 실적 근거
1) 실적명 (연도)
   구체적 성과·수치·역할
2) 실적명 (연도)
   구체적 성과·수치·역할
3) 실적명 (연도)
   구체적 성과·수치·역할

▎접근 방식
- 항목 1 (아키텍처·툴·프로세스)
- 항목 2
- 항목 3
- 항목 4 (선택)

▎산출물·일정 (N일)
일정
- 1~M주차: 단계명
- ...

산출물
- 항목 1
- 항목 2
- 항목 3

▎근무 방식
(2~3문장 · 재직 병행 · 원격 협업 · 커뮤니케이션 방식)

▎다음 스텝
(1~2문장 · 사전 분석 상담 · 미팅 제안 · 회신 소요)

# 형식 규칙
- 각 섹션 헤더 "▎…" 는 반드시 정확한 유니코드 문자 사용 (별도 마크다운 X)
- JSON 응답의 proposal 필드 안에서는 실제 개행문자 \\n 을 사용 (문자열 그대로 유지 · 압축 금지)
- 마크다운 문법 (#, **, __ 등) 사용 금지 · 심볼 (▎, ·, →) 만 허용
- 각 리스트 항목은 짧게 · 문장 나열 대신 핵심 키워드

# 내용 규칙
- 사용자가 실제 보유하지 않은 기술·실적을 절대 만들어내지 마세요.
- 프로젝트가 상주(contractor)만 가능한 경우 원격 대안이나 시간대 협의를 언급합니다.
- 예산·기간 추정 시 프로젝트에 명시된 값을 기본으로, 사용자 재직 병행 조건을 감안합니다 (기간 60일 초과 → 저녁·주말 대응 명시).
- 결과 판단이 불확실한 항목은 "미팅 시 확정" 으로 유보합니다.
`;

export async function generateDraft(project: ProjectContext): Promise<DraftResult> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const err = new Error("ZAI_API_KEY missing · Vercel/로컬 env 등록 필요");
    (err as { status?: number }).status = 503;
    throw err;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });
  const model = process.env.ZAI_MODEL || DEFAULT_MODEL;

  const projectBlock = renderProjectBlock(project);

  // z.ai 시스템 메시지는 문자열 하나 (Anthropic 의 배열 블록과 다름).
  // system + user profile 을 한 문자열에 concat · 앞쪽에 배치하여 자동 캐싱 효율↑.
  const systemContent = `${SYSTEM_INSTRUCTIONS}\n\n# 사용자 프로필 (홍해연)\n\n${USER_PROFILE}`;

  // GLM-5.2 thinking 모드가 활성이면 reasoning_content 로 토큰이 소진됨.
  // 초안 생성은 곧바로 답이 필요하므로 thinking 을 비활성화하고, 예산 여유를 준다.
  const response = await client.chat.completions.create(
    {
      model,
      temperature: 0.5,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `다음 프로젝트에 지원하는 제안서 초안을 JSON 형식으로 작성하세요.\n\n${projectBlock}`,
        },
      ],
      // @ts-expect-error z.ai 확장 파라미터 · OpenAI SDK 타입에는 없으나 서버는 수용
      thinking: { type: "disabled" },
    },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    // Emit response structure for diagnosis (server logs only · no user secrets)
    console.error(
      "[draft-generator] empty content · response shape:",
      JSON.stringify(response, null, 2).slice(0, 2500),
    );
    throw new Error("GLM 응답에서 텍스트 콘텐츠를 찾을 수 없음");
  }
  return parseDraftJson(content);
}

function renderProjectBlock(p: ProjectContext): string {
  const budget = formatBudgetRange(p.budget_min, p.budget_max);
  return `채널: ${p.channel}
제목: ${p.title}
카테고리: ${p.category ?? "-"}
계약 형태: ${p.contract_type ?? "-"} · 근무 형태: ${p.work_type ?? "-"} · 위치: ${p.location ?? "-"}
예산: ${budget}
예상 기간: ${p.duration_days ?? "-"}일
요구 스킬: ${(p.skills ?? []).join(", ") || "-"}
원 페이지: ${p.external_url}
설명: ${p.description ?? "-"}`;
}

function formatBudgetRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "미공개";
  const fmt = (n: number) => `${(n / 10000).toLocaleString()}만원`;
  if (min != null && max != null && min !== max) return `${fmt(min)} ~ ${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

function parseDraftJson(raw: string): DraftResult {
  const jsonText = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonText) as {
    proposal?: string;
    suggested_budget?: number | null;
    suggested_duration_days?: number | null;
  };
  if (!parsed.proposal || typeof parsed.proposal !== "string") {
    throw new Error("proposal 필드가 없음");
  }
  return {
    proposal: parsed.proposal,
    suggestedBudget:
      typeof parsed.suggested_budget === "number" ? parsed.suggested_budget : null,
    suggestedDurationDays:
      typeof parsed.suggested_duration_days === "number"
        ? parsed.suggested_duration_days
        : null,
  };
}

function extractJsonPayload(raw: string): string {
  // Occasionally the model wraps JSON in ```json blocks — strip if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Fallback: first '{' to last '}'
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0) return raw;
  return raw.slice(first, last + 1);
}
