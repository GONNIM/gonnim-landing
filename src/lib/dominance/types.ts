// 지배상식 · 콘솔이 쓰는 행 타입과 라벨.
// DDL: db/2026-09-25-dominance-schema.sql

export type CandidateState = "open" | "drafted" | "used" | "excluded";

// 5단계 흐름. review 와 reviewed 는 다르다 —
// review 는 "다 썼다", reviewed 는 "리뷰를 끝냈다" 이고 발행일은 후자에만 붙는다.
export type LetterStatus =
  | "draft"
  | "review"
  | "reviewed"
  | "approved"
  | "published";

export const LETTER_STATUS_LABEL: Record<LetterStatus, string> = {
  draft: "쓰는 중",
  review: "리뷰 대기",
  reviewed: "리뷰 통과",
  approved: "발행 예정",
  published: "발행됨",
};

export const LETTER_STATUS_STYLE: Record<LetterStatus, string> = {
  draft: "bg-[color:var(--muted)]/20 text-muted-foreground",
  review: "bg-amber-500/20 text-amber-300",
  reviewed: "bg-violet-500/20 text-violet-300",
  approved: "bg-sky-500/20 text-sky-300",
  published: "bg-emerald-500/20 text-emerald-300",
};

export const AGENCY_LABEL: Record<string, string> = {
  mohw: "보건복지부",
  msit: "과학기술정보통신부",
  kdca: "질병관리청",
};

export const SOURCE_LABEL: Record<string, string> = {
  arxiv: "arXiv",
  medrxiv: "medRxiv",
  biorxiv: "bioRxiv",
  europepmc: "Europe PMC",
};

// 허용 목록 세 가지. 이 밖의 라이선스는 ds_papers 에 행이 생기지 않는다.
export const LICENSE_LABEL: Record<string, string> = {
  cc0: "CC0",
  cc_by: "CC BY",
  public_domain: "퍼블릭 도메인",
};

// operations.md 의 5축. 흥미가 가장 무겁다(30).
export const SCORE_WEIGHTS = {
  interest: 30,
  gap: 25,
  body: 20,
  industry: 15,
  trust: 10,
} as const;

export type ScoreAxis = keyof typeof SCORE_WEIGHTS;

export const AXIS_LABEL: Record<ScoreAxis, string> = {
  interest: "흥미",
  gap: "정보 격차",
  body: "내 몸",
  industry: "산업 연결",
  trust: "신뢰",
};

// 흥미 축의 하위 신호. 역설이 가장 강하다.
export const INTEREST_SIGNAL_WEIGHTS = {
  paradox: 12,
  counterintuitive: 8,
  number: 6,
  name: 4,
} as const;

export type InterestSignal = keyof typeof INTEREST_SIGNAL_WEIGHTS;

export const INTEREST_SIGNAL_LABEL: Record<InterestSignal, string> = {
  paradox: "역설",
  counterintuitive: "반직관",
  number: "놀라운 수치",
  name: "아는 이름",
};

export type ScoreBreakdown = {
  interest: {
    value: number;
    why: string;
    // 이 연구가 깨는 통설을 한 문장으로. 훅 블록의 재료가 된다.
    paradoxLine: string | null;
    signals: Partial<Record<InterestSignal, number>>;
  };
  gap: { value: number; why: string };
  body: { value: number; why: string };
  industry: { value: number; why: string };
  trust: { value: number; why: string };
};

export type CandidateRow = {
  id: string;
  candidate_date: string;
  paper_id: string | null;
  gov_press_id: string | null;
  headline: string;
  hook: string | null;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  state: CandidateState;
  excluded_reason: string | null;
  created_at: string;
};

// 레터 본문은 블록 배열이다. concept.md 구조를 블록 kind 로 그대로 옮긴다.
export type BlockKind =
  | "summary"
  | "hook"
  | "research"
  | "mechanism"
  | "industry"
  | "practice"
  | "metaphor";

export const BLOCK_LABEL: Record<BlockKind, string> = {
  summary: "3줄 요약",
  hook: "훅",
  research: "1차 연구 (링크아웃)",
  mechanism: "메커니즘",
  industry: "산업",
  practice: "실천",
  metaphor: "은유",
};

export const BLOCK_ORDER: BlockKind[] = [
  "summary",
  "hook",
  "research",
  "mechanism",
  "industry",
  "practice",
  "metaphor",
];

export type LetterBlock = {
  kind: BlockKind;
  text: string;
  // 거절 필터에 걸린 사유. 비어 있어야 [완성] 버튼이 열린다.
  flags?: string[];
  // 이 블록이 인용한 원천. 사실 문장 블록은 비어 있으면 무출처 플래그가 붙는다.
  sourceIds?: string[];
};

// 리뷰 화면의 자동 점검 7항목. blocking 이 하나라도 남으면 [리뷰 통과] 가 잠긴다.
export type ReviewCheckCode =
  | "filters"
  | "blocks"
  | "sources"
  | "links"
  | "hook"
  | "paradox"
  | "sentence_length";

export const REVIEW_CHECK_LABEL: Record<ReviewCheckCode, string> = {
  filters: "거절 필터 경고 0건",
  blocks: "7개 블록 모두 있음",
  sources: "사실 블록에 출처 모두 있음",
  links: "원천 링크 정상",
  hook: "훅이 질문으로 끝남",
  paradox: "역설 한 문장이 들어감",
  sentence_length: "60자 넘는 문장 없음",
};

// 앞의 4개는 막고 뒤의 3개는 경고만 한다.
// 앞의 4개는 틀리면 사실 관계나 저작권 문제가 되고, 뒤의 3개는 기계 판단이 틀릴 수 있다.
export const BLOCKING_REVIEW_CHECKS: ReviewCheckCode[] = [
  "filters",
  "blocks",
  "sources",
  "links",
];

export type ReviewCheck = {
  code: ReviewCheckCode;
  passed: boolean;
  detail: string | null;
};

export type CrossReviewNote = {
  kind: "unsourced" | "advice" | "coherence";
  message: string;
  blockIndex: number | null;
};

export type ReviewChecks = {
  checks: ReviewCheck[];
  crossReview: CrossReviewNote[];
  checkedAt: string;
};

export type LetterRow = {
  id: string;
  candidate_id: string | null;
  slug: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  scheduled_for: string | null;
  status: LetterStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_checks: ReviewChecks | null;
  revision_count: number;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  resend_broadcast_id: string | null;
  sent_at: string | null;
  sent_count: number | null;
  open_rate: number | null;
  stats_synced_at: string | null;
  created_at: string;
  updated_at: string;
};
