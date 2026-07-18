// Sprint 정밀 분석 리포트 생성기 · z.ai GLM-5.2
//
// 목적:
//   - 지원 초안 (draft-generator) 과 별개 · Go/No-go 판단 + 상용화 자산화 방향
//   - Sprint ₩1억 = 개별 계약 나열 X · 반복 가능한 매출 구조 · "파는 건 내 몫"
//
// 응답 스키마:
//   {
//     "report": "5섹션 markdown 본문 (▎헤더)",
//     "go_decision": "go" | "no-go" | "conditional",
//     "go_reason": "1문장 요약"
//   }
//
// 도메인 지식 활용: GLM-5.2 1M 컨텍스트 · 트렌드·시장·상용화 아이디어 도메인 지식 활용.

import OpenAI from "openai";
import { USER_PROFILE } from "./radar-user-profile";
import type { ProjectContext } from "./draft-generator";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

export type GoDecision = "go" | "no-go" | "conditional";

export type InsightResult = {
  report: string;
  goDecision: GoDecision | null;
  goReason: string;
};

const SYSTEM_INSTRUCTIONS = `당신은 22년차 풀사이클 시니어 엔지니어 홍해연의 프리랜서 창업 전략 어드바이저입니다.
프로젝트 지원 전 Go/No-go 를 결정하고, 계약 후 이 프로젝트에서 자산화·상용화할 수 있는 방향을 제시합니다.
사용자의 궁극 목표: 2026년 개인 연매출 ₩1억 (Sprint 2026-07-07~2027-07-06). 개별 계약 나열이 아니라 반복 가능한 매출 구조 필요.

# 판단 원칙 (엄격)
- 사용자 재직 병행 (평일 4시간 여유 + 저녁·주말) 조건 하에 실 진행 가능한가?
- 상주(contractor) 강제 · 60일+ 대형 상주 = No-go 기본값
- 원격·외주(outsourcing) + 60일 이내 = Go 기본값
- 조건부는 조건이 명확할 때만 (예: "특정 산출물 축소 협의 시")
- 사용자가 보유하지 않은 기술·실적을 절대 만들지 마세요 (fabrication 금지)
- 위 프로필의 도메인 강점 (Local LLM · RAG · 정부과제 · 대기업·머신비전 · 풀스택) 을 명시 근거로 활용
- 상용화 방안은 이 프로젝트를 재사용 가능한 자산 (SaaS · 프레임워크 · 템플릿 · SOP · 컨설팅 상품) 로 확장할 각도를 제시

# 출력 형식 (엄수)
반드시 다음 JSON 형식으로만 응답. 다른 설명·마크다운 wrapper 없이 JSON 만:
{
  "report": "5섹션 리포트 본문 (아래 형식 엄수 · 1800~3200자 · 한국어 · 존댓말)",
  "go_decision": "go" | "no-go" | "conditional",
  "go_reason": "1문장 요약 (60자 이내 · 결정 근거)"
}

# report 형식 (엄수)
아래 5섹션 헤더를 그대로 사용 · 각 섹션 사이 빈 줄(\\n\\n) 삽입:

▎1. 프로젝트 정밀 분석
- 표면 요구사항 요약 (1~2문장)
- 진짜 니즈 추정 (2~3문장 · 도메인 지식 활용 · 표면과 다르면 명시)
- 클라이언트 특성 추정 (업종·규모·의사결정 구조 · 2~3문장)
- 예산·기간의 현실성 판단 (1~2문장 · 시세 대비)
- 리스크·함정 3점 (스코프 크리프 · 상주 강제 · 결제 지연 · 재계약 종속 등 중 3점)

▎2. 진행 판단
- 결정: Go / No-go / Conditional-Go 중 1개 (명확히 표기)
- 근거 3점 (각 1~2문장 · 재직 병행 조건·사용자 강점 매칭·리스크 balance)
- 조건부라면 조건 명시 (예: "N일 이내 · 원격 협의 시")

▎3. 도메인 정밀 분석
- 도메인 시장·트렌드 (2026 기준 · 2~3문장 · 성장·정체·규제 변수)
- 유사 프로젝트 벤치마크 (2~3점 · 국내외 실 사례 또는 유형)
- 사용자 자산 매칭 지점 (2~3점 · 위 프로필의 어떤 실적·기술이 정합한지)

▎4. 상용화 방안 (★ 핵심)
- 재사용 가능한 자산 (이 프로젝트에서 뽑을 수 있는 컴포넌트·프레임워크·템플릿·SOP · 3점)
- 파생 서비스 3가지 (SaaS · 제품 · 컨설팅 상품 · 솔루션 · 각 1~2문장 · 사용자 강점 매칭)
- 잠재 타겟 고객군 + 진입 채널 (2점 · 구체 타겟명 · 진입 방식)

▎5. 다음 액션
- 지원 결정 시 어필 포인트 3점 (초안에 반영할 각도 · 짧게)
- 계약 진행 중 확보할 자산 체크리스트 (3~5점 · 실행 가능한 항목)
- Sprint 매출 트리 위치 (첫 계약 매출 규모 or 파생 매출 시나리오 · 1~2문장)

# 형식 규칙
- 섹션 헤더 "▎…" 는 반드시 정확한 유니코드 문자
- JSON 응답의 report 필드 안에서 실제 개행문자 \\n 사용
- 마크다운 문법 (#, **, __) 금지 · 심볼 (▎, ·, →, ★) 만 허용
- 리스트 항목은 짧게 · 문장 나열 대신 핵심 키워드
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
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `다음 프로젝트에 대한 정밀 분석 리포트를 JSON 으로 작성하세요.\n\n${projectBlock}`,
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
    go_decision?: string;
    go_reason?: string;
  };
  if (!parsed.report || typeof parsed.report !== "string") {
    throw new Error("report 필드가 없음");
  }
  const rawDecision = (parsed.go_decision ?? "").toLowerCase().trim();
  const goDecision: GoDecision | null =
    rawDecision === "go" || rawDecision === "no-go" || rawDecision === "conditional"
      ? (rawDecision as GoDecision)
      : null;
  return {
    report: parsed.report,
    goDecision,
    goReason: typeof parsed.go_reason === "string" ? parsed.go_reason : "",
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
