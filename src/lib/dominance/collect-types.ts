// [증거 모으기] 의 단계 이름과 결과 요약 형태 · 화면(클라이언트)도 읽으므로 LLM 코드와 떼어 둔다.

import type { Slot } from "./evidence";

export const PHASES = ["search", "premise_body", "industry", "retry"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  search: "논문 조회 · 배정 · 대조",
  premise_body: "정설 본문(서론) 찾기",
  industry: "산업 검색 링크",
  retry: "검색어 다시 쓰고 한 번 더",
};

export type IndustryLink = {
  name: string;
  why: string;
  query: string;
  edgar: { url: string };
  reporter: { url: string | null; count: number | null };
  dart: string | null;
};

export type EvidenceRun = {
  startedAt: string;
  updatedAt: string;
  queries: string[];
  retryQueries: string[] | null;
  phases: { phase: Phase; ms: number; note: string }[];
  added: number;
  verifyFailed: number;
  duplicates: number;
  llmCalls: number;
  epmcCalls: number;
  perSlot: Record<Slot, { sources: number; facts: number }>;
  total: number;
  industry: IndustryLink[];
  errors: string[];
  /** 이미 본 논문(다시 LLM 에 넣지 않는다) */
  seen: string[];
  done: boolean;
};

