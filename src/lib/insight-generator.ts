// Sprint 사업화 타당성 리포트 생성기 · z.ai GLM-5.2
//
// 관점 (재정의 · 2026-07-18):
//   프로젝트 공고 = 프리랜서 지원 대상 X · **사업 아이템 후보**
//   기업이 실 예산 지불 의사를 드러낸 pain signal → 시장에 재조립 가능한지 검증
//
// 흐름:
//   프로젝트 정밀 분석 → 시장 가설 → 마켓 검증 (레드오션 판정) →
//   차별화 각도 → 사업화 모델 3가지 → 파일럿 실행 → 최종 판정
//
// 응답:
//   {
//     "report": "7섹션 markdown (▎헤더)",
//     "competition_level": "red" | "yellow" | "blue",
//     "business_grade": "A" | "B" | "C" | "D",
//     "verdict": "1문장 요약"
//   }

import OpenAI from "openai";
import { USER_PROFILE } from "./radar-user-profile";
import type { ProjectContext } from "./draft-generator";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

export type CompetitionLevel = "red" | "yellow" | "blue";
export type BusinessGrade = "A" | "B" | "C" | "D";

export type InsightResult = {
  report: string;
  competitionLevel: CompetitionLevel | null;
  businessGrade: BusinessGrade | null;
  verdict: string;
};

const SYSTEM_INSTRUCTIONS = `당신은 22년차 풀사이클 시니어 엔지니어 홍해연의 사업화 전략 어드바이저이자 시장 분석가입니다.
프로젝트 공고를 "프리랜서 지원 대상" 이 아닌 **사업 아이템 후보** 로 취급합니다.
공고는 특정 기업이 실 예산으로 지불 의사를 드러낸 pain signal 입니다.
이 pain 을 재조립해 사용자 자체 사업 (컨설팅 · SaaS · 라이선스 등) 으로 확장할 수 있는지 판단합니다.

사용자의 궁극 목표: 2026년 개인 연매출 ₩1억 (Sprint 2026-07-07~2027-07-06). 재직 병행 · 저녁·주말 자원.
개별 계약 나열 X · **반복 가능한 매출 구조** 확보가 핵심.

# 분석 원칙 (엄격)
- 재현성 판단: 이 pain 이 **다수 기업 공통** 인가 (사업화 가능) vs **단일 기업 특수** 인가 (사업화 불가)
- 시장 검증: 국내 유사 솔루션 2~3개 + 해외 유사 솔루션 2~3개 반드시 조사 (각 이름·강점·약점·가격대)
- 경쟁 강도: 🔴 Red (포화·차별화 각도 부재) · 🟡 Yellow (경쟁 있으나 진입 각도) · 🔵 Blue (미개척·검증 리스크 존재)
- 사업 모델 3가지 (컨설팅 · SaaS · 라이선스) 각각 매출·자본·배수 비교
- 파일럿 계획: 재직 병행 조건 하에 4~8주 개발 MVP · 첫 유료 고객 3~5명 확보 · Kill/Go 마일스톤 (3·6개월)
- 사용자가 실제 보유하지 않은 기술·실적을 절대 만들지 마세요
- 위 프로필의 강점 (Local LLM · RAG · 정부과제 · 대기업 검증 · 22년차 시니어) 을 명시 근거로 활용

# 판정 기준
- competition_level: red/yellow/blue (경쟁 강도)
- business_grade:
  - A: 사업화 강추 · 재현성 확인 · 진입 각도 확보 · 사용자 자산 정합
  - B: 조건부 · 특정 조건 (자본·파트너·시점) 충족 시 진행
  - C: 재검토 · 시장 존재하나 사용자 자산 정합 낮음 or 자본 필요 과다
  - D: 제외 · 단일 기업 특수 pain or 이미 포화 · 차별화 각도 없음

# 출력 형식 (엄수)
반드시 다음 JSON 형식으로만 응답. 다른 설명·마크다운 wrapper 없이 JSON 만:
{
  "report": "7섹션 리포트 (아래 형식 엄수 · 2800~4500자 · 한국어 · 존댓말)",
  "competition_level": "red" | "yellow" | "blue",
  "business_grade": "A" | "B" | "C" | "D",
  "verdict": "1문장 요약 (80자 이내 · 판정 근거)"
}

# report 형식 (엄수)
아래 7섹션 헤더를 그대로 사용 · 각 섹션 사이 빈 줄(\\n\\n) 삽입:

▎1. 프로젝트 정밀 분석 · 인사이트 도출
- 표면 요구 vs 진짜 니즈 (2~3문장 · 도메인 지식 활용)
- 재현성 판단 (이 기업 특수 vs 다수 기업 공통 · 근거 1~2문장)
- 문제 심각성 · 지불 근거 (원 공고 예산이 시사하는 지불 의사 수준 · 1~2문장)

▎2. 잠재 시장 정의
- 잠재 고객 세그먼트 (누가 · 국내 기업 규모 · 2~3문장)
- 국내 시장 크기 근사 (기업 수 × 예산 range · 근사치 표기 · 1~2문장)
- 지불 의사 근거 (기업이 이 pain 해결에 예산 배정하는 이유 · 1~2문장)

▎3. 마켓 검증 · 레드오션 여부 ★
- 국내 유사 솔루션 (2~3개 · 각각 다음 형식으로 작성)
  · [솔루션명] · 강점 [~] · 약점 [~] · 가격대 [~]
- 해외 유사 솔루션 (2~3개 · 동일 형식)
  · [솔루션명] · 강점 [~] · 약점 [~] · 가격대 [~]
- 경쟁 강도 판정 → 🔴 Red / 🟡 Yellow / 🔵 Blue 중 1개 + 근거 2문장
- 진입장벽 3점 (기술·자본·네트워크·규제 중 3점 · 각 1문장)

▎4. 차별화 각도 (사용자 강점 → 진입점)
- 사용자 자산 정합 (프로필 실적 중 이 도메인에 매칭되는 3점)
- 기존 솔루션에 없는 각도 3가지 (각 1~2문장 · 구체적 · 검증 가능)
- 각 각도의 지불 의사 유발 판단 (왜 고객이 돈 낼 것인가 · 각 1문장)

▎5. 사업화 모델 3가지 (매출·자본·배수 비교)
- A안 컨설팅·에이전시
  · 매출 모델 · 필요 자본 · 반복성 · 초기 6개월 시나리오
- B안 SaaS·프로덕트
  · 매출 모델 · 필요 자본 · 반복성 · 초기 6개월 시나리오
- C안 라이선스·API·플러그인
  · 매출 모델 · 필요 자본 · 반복성 · 초기 6개월 시나리오
- 사용자 재직 병행 조건에서 추천 모델 (1개 · 근거 1~2문장)

▎6. 파일럿 실행 계획
- MVP 스펙 (4~8주 개발 가능 · 최소 기능 3~5점 · 무엇을 안 만들 것인가도 명시)
- 첫 유료 고객 3~5명 확보 계획 (채널 2~3점 · 오퍼 1점 · 예상 CAC)
- Kill/Go 마일스톤
  · 3개월 지점: 정량 지표 (예: 유료 3명 · MRR ₩X)
  · 6개월 지점: 정량 지표 (예: 유료 10명 · MRR ₩X)

▎7. 최종 판정
- Business Grade: A / B / C / D (명확히 표기)
- Competition Level: 🔴 Red / 🟡 Yellow / 🔵 Blue (명확히 표기)
- Sprint Fit: high / medium / low (재직 병행 12개월 ₩1억 정합도)
- 한 줄 결론 (실행 여부 + 핵심 근거 · 60~80자)

# 형식 규칙
- 섹션 헤더 "▎…" 는 반드시 정확한 유니코드 문자
- JSON 응답의 report 필드 안에서 실제 개행문자 \\n 사용
- 마크다운 문법 (#, **, __) 금지 · 심볼 (▎, ·, →, ★, 🔴, 🟡, 🔵) 만 허용
- 각 유사 솔루션은 실제 존재하는 서비스명 사용 (모르면 "미확인" 표기 · 가공 금지)
- 사용자가 실제 보유하지 않은 기술·실적 절대 만들지 마세요
`;

export async function generateInsight(project: ProjectContext): Promise<InsightResult> {
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
  const systemContent = `${SYSTEM_INSTRUCTIONS}\n\n# 사용자 프로필 (홍해연)\n\n${USER_PROFILE}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 10000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `다음 프로젝트 공고를 사업 아이템 후보로 취급하여 사업화 타당성 리포트를 JSON 으로 작성하세요.\n\n${projectBlock}`,
      },
    ],
    // @ts-expect-error z.ai 확장 파라미터 (thinking 비활성)
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error(
      "[insight-generator] empty content · response shape:",
      JSON.stringify(response, null, 2).slice(0, 2500),
    );
    throw new Error("GLM 응답에서 텍스트 콘텐츠를 찾을 수 없음");
  }
  return parseInsightJson(content);
}

function renderProjectBlock(p: ProjectContext): string {
  const budget = formatBudgetRange(p.budget_min, p.budget_max);
  const base = `채널: ${p.channel}
제목: ${p.title}
카테고리: ${p.category ?? "-"}
계약 형태: ${p.contract_type ?? "-"} · 근무 형태: ${p.work_type ?? "-"} · 위치: ${p.location ?? "-"}
예산: ${budget}
예상 기간: ${p.duration_days ?? "-"}일
요구 스킬: ${(p.skills ?? []).join(", ") || "-"}
원 페이지: ${p.external_url}
설명: ${p.description ?? "-"}`;

  const note = (p.userNote ?? "").trim();
  if (!note || note === "-") return base;
  return `${base}

사용자 사전 판단·전략 노트:
${note}`;
}

function formatBudgetRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "미공개";
  const fmt = (n: number) => `${(n / 10000).toLocaleString()}만원`;
  if (min != null && max != null && min !== max) return `${fmt(min)} ~ ${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

function parseInsightJson(raw: string): InsightResult {
  const jsonText = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonText) as {
    report?: string;
    competition_level?: string;
    business_grade?: string;
    verdict?: string;
  };
  if (!parsed.report || typeof parsed.report !== "string") {
    throw new Error("report 필드가 없음");
  }
  const rawComp = (parsed.competition_level ?? "").toLowerCase().trim();
  const competitionLevel: CompetitionLevel | null =
    rawComp === "red" || rawComp === "yellow" || rawComp === "blue"
      ? (rawComp as CompetitionLevel)
      : null;
  const rawGrade = (parsed.business_grade ?? "").toUpperCase().trim();
  const businessGrade: BusinessGrade | null =
    rawGrade === "A" || rawGrade === "B" || rawGrade === "C" || rawGrade === "D"
      ? (rawGrade as BusinessGrade)
      : null;
  return {
    report: parsed.report,
    competitionLevel,
    businessGrade,
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "",
  };
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0) return raw;
  return raw.slice(first, last + 1);
}
