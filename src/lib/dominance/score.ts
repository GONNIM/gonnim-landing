// 후보 점수 · 5축. 흥미가 가장 무겁다(30).
//
// 두 단계로 나눈다. 대부분은 글자만 보고 계산하고(돈이 들지 않는다),
// 역설과 반직관만 LLM 에게 묻는다. 초록만 읽고 규칙으로 잡히지 않기 때문이다.
// 매일 200건을 전부 LLM 에 보내지 않고, 글자 점수 상위만 골라 한 번에 묻는다.

import type {
  InterestSignal,
  ScoreBreakdown,
} from "./types";
import { INTEREST_SIGNAL_WEIGHTS, SCORE_WEIGHTS } from "./types";

export type ScoreInput = {
  title: string;
  abstract: string | null;
  publishedDate: string | null;
  /** 정부 보도자료는 이미 한국어로 나왔으므로 정보 격차가 작다. */
  kind: "paper" | "press";
};

/** 신뢰 점수가 이 아래면 후보로 올리지 않는다. 흥미가 아무리 높아도 올리지 않는다. */
export const TRUST_FLOOR = 3;

const BODY_KEYWORDS = [
  "health", "disease", "patient", "clinical", "血", "brain", "sleep",
  "muscle", "blood", "immune", "cancer", "aging", "ageing", "diet",
  "exercise", "gut", "microbiome", "metabolic", "obesity", "diabetes",
  "depression", "cognitive", "vaccine", "infection", "mortality",
  "건강", "질병", "환자", "임상", "수면", "면역", "노화", "치매", "감염",
];

const HUMAN_MARKERS = [
  "participants", "patients", "cohort", "randomized", "randomised",
  "human subjects", "volunteers", "adults", "children", "환자", "참여자",
];

const ANIMAL_MARKERS = ["mice", "mouse", "rat", "zebrafish", "primate", "생쥐"];
const CELL_MARKERS = ["in vitro", "cell line", "organoid", "세포주"];

const INDUSTRY_MARKERS = [
  "biotech", "pharmaceutical", "pharma", "startup", "company", "inc.",
  "trial phase", "phase i", "phase ii", "phase iii", "fda", "investment",
  "funding", "billion", "million", "market", "기업", "투자", "임상시험",
  "제약", "산업", "상용화",
];

const REPLICATION_MARKERS = [
  "replicat", "meta-analysis", "systematic review", "validation cohort",
  "pre-registered", "preregistered", "재현", "메타분석",
];

const NOTABLE_NAMES = [
  "Nature", "Science", "Cell", "NEJM", "Lancet", "JAMA",
  "Google", "DeepMind", "OpenAI", "Altos Labs", "Retro Biosciences",
  "Calico", "Moderna", "Pfizer", "Novo Nordisk", "Eli Lilly",
  "Harvard", "MIT", "Stanford", "Oxford", "삼성", "SK", "LG",
];

function haystack(input: ScoreInput): string {
  return `${input.title} ${input.abstract ?? ""}`.toLowerCase();
}

function countHits(text: string, needles: string[]): number {
  return needles.filter((n) => text.includes(n.toLowerCase())).length;
}

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** 눈으로 짚기 어려운 수치가 있는가. 한 자리 수는 세지 않는다. */
function hasSurprisingNumber(text: string): boolean {
  return /\b\d{2,}(\.\d+)?\s*(%|배|fold|times|년|years|-year|억|million|billion)/i.test(
    text,
  );
}

function scale(raw: number, max: number, weight: number): number {
  if (max <= 0) return 0;
  return Math.round(Math.min(raw / max, 1) * weight);
}

/**
 * 글자만 보고 매기는 점수. 흥미 축에서는 수치와 이름만 채우고,
 * 역설과 반직관은 0 으로 둔 뒤 LLM 결과를 나중에 더한다.
 */
export function scoreWithoutLlm(input: ScoreInput): ScoreBreakdown {
  const text = haystack(input);

  // 정보 격차 · 갓 나온 논문이 가장 값지다. 보도자료는 이미 한국어로 나왔다.
  const age = daysSince(input.publishedDate);
  const freshness =
    age === null ? 0.4 : age <= 3 ? 1 : age <= 7 ? 0.8 : age <= 21 ? 0.5 : 0.2;
  const koreanPenalty = input.kind === "press" ? 0.4 : 1;
  const gap = Math.round(SCORE_WEIGHTS.gap * freshness * koreanPenalty);

  // 내 몸 · 보건 낱말과 사람 대상 여부.
  const bodyHits = countHits(text, BODY_KEYWORDS);
  const humanHits = countHits(text, HUMAN_MARKERS);
  const body = Math.min(
    SCORE_WEIGHTS.body,
    scale(bodyHits, 5, 14) + (humanHits > 0 ? 6 : 0),
  );

  // 산업 연결 · 돈이 붙은 이야기인가.
  const industryHits = countHits(text, INDUSTRY_MARKERS);
  const industry = scale(industryHits, 4, SCORE_WEIGHTS.industry);

  // 신뢰 · 사람 > 동물 > 세포. 재현 근거가 있으면 더한다.
  const subjectPoints =
    humanHits > 0 ? 6 : countHits(text, ANIMAL_MARKERS) > 0 ? 4 : countHits(text, CELL_MARKERS) > 0 ? 2 : 1;
  const samplePoints = /\bn\s*=\s*\d{2,}/i.test(text) ? 2 : 0;
  const replicationPoints = countHits(text, REPLICATION_MARKERS) > 0 ? 2 : 0;
  const trust = Math.min(
    SCORE_WEIGHTS.trust,
    subjectPoints + samplePoints + replicationPoints,
  );

  const signals: Partial<Record<InterestSignal, number>> = {};
  if (hasSurprisingNumber(`${input.title} ${input.abstract ?? ""}`)) {
    signals.number = INTEREST_SIGNAL_WEIGHTS.number;
  }
  if (NOTABLE_NAMES.some((n) => text.includes(n.toLowerCase()))) {
    signals.name = INTEREST_SIGNAL_WEIGHTS.name;
  }

  const interestValue = Object.values(signals).reduce((a, b) => a + b, 0);

  return {
    interest: {
      value: interestValue,
      why:
        Object.keys(signals).length > 0
          ? `${Object.keys(signals).join(", ")} 신호가 잡혔습니다`
          : "글자로 잡히는 흥미 신호가 없습니다",
      paradoxLine: null,
      signals,
    },
    gap: {
      value: gap,
      why:
        age === null
          ? "게재일을 읽지 못했습니다"
          : `게재 ${age}일 경과${input.kind === "press" ? " · 이미 한국어로 나온 자료입니다" : ""}`,
    },
    body: {
      value: body,
      why: `보건 낱말 ${bodyHits}개${humanHits > 0 ? " · 사람 대상" : ""}`,
    },
    industry: {
      value: industry,
      why: industryHits > 0 ? `산업 낱말 ${industryHits}개` : "산업 연결이 보이지 않습니다",
    },
    trust: {
      value: trust,
      why: `${humanHits > 0 ? "사람" : countHits(text, ANIMAL_MARKERS) > 0 ? "동물" : countHits(text, CELL_MARKERS) > 0 ? "세포" : "대상 불명"}${samplePoints ? " · 표본 수 명시" : ""}${replicationPoints ? " · 재현 근거" : ""}`,
    },
  };
}

/** LLM 이 찾아 준 역설과 반직관을 흥미 축에 더한다. */
export function applyParadox(
  breakdown: ScoreBreakdown,
  found: { paradoxLine: string | null; counterintuitive: boolean },
): ScoreBreakdown {
  const signals = { ...breakdown.interest.signals };
  if (found.paradoxLine) signals.paradox = INTEREST_SIGNAL_WEIGHTS.paradox;
  if (found.counterintuitive) {
    signals.counterintuitive = INTEREST_SIGNAL_WEIGHTS.counterintuitive;
  }

  const value = Math.min(
    SCORE_WEIGHTS.interest,
    Object.values(signals).reduce((a, b) => a + b, 0),
  );

  return {
    ...breakdown,
    interest: {
      value,
      why: found.paradoxLine
        ? "통설을 깨는 문장이 있습니다"
        : breakdown.interest.why,
      paradoxLine: found.paradoxLine,
      signals,
    },
  };
}

export function totalScore(breakdown: ScoreBreakdown): number {
  const sum =
    breakdown.interest.value +
    breakdown.gap.value +
    breakdown.body.value +
    breakdown.industry.value +
    breakdown.trust.value;
  return Math.max(0, Math.min(100, sum));
}

export function meetsTrustFloor(breakdown: ScoreBreakdown): boolean {
  return breakdown.trust.value >= TRUST_FLOOR;
}
