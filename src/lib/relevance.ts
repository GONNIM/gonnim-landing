// Rule-based relevance scoring · Sprint Radar
// Reflects user constraints: 재직 병행 · 근무 여유 4h · AI/LLM/RAG 자산

import type { Project } from "@/lib/supabase/types";

export interface RelevanceResult {
  score: number; // 0..10
  breakdown: Record<string, number>;
}

const AI_KEYWORDS = [
  "ai",
  "llm",
  "rag",
  "chatbot",
  "챗봇",
  "ollama",
  "openai",
  "gpt",
  "llama",
  "langchain",
  "embedding",
  "vector",
  "머신러닝",
  "인공지능",
];

const DOMAIN_KEYWORDS = ["노무", "세무", "법무", "의료", "개인정보", "회계", "특허"];

const STACK_KEYWORDS = [
  "python",
  "next.js",
  "nextjs",
  "typescript",
  "react",
  "node.js",
  "nodejs",
  "fastapi",
  "docker",
  "aws",
  "gcp",
  "mongodb",
  "postgres",
  "supabase",
];

export function calculateRelevance(project: Project | ProjectLike): RelevanceResult {
  const breakdown: Record<string, number> = {};

  // 1) Contract type · 재직 병행 정합
  if (project.contract_type === "outsourcing") breakdown.outsourcing = +3;
  if (project.contract_type === "contractor") breakdown.contractor = -5;

  // 2) Work type
  if (project.work_type === "remote") breakdown.remote = +2;
  if (project.work_type === "onsite") breakdown.onsite = -3;

  // 3) AI/LLM skill or title match
  const haystack = [
    project.title,
    project.description ?? "",
    (project.skills ?? []).join(" "),
    project.category ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const aiHits = AI_KEYWORDS.filter((k) => haystack.includes(k));
  if (aiHits.length > 0) breakdown.ai_match = Math.min(+4, aiHits.length * 2);

  // 4) Domain match (AI 홍변 v3 계열)
  const domainHits = DOMAIN_KEYWORDS.filter((k) => haystack.includes(k));
  if (domainHits.length > 0) breakdown.domain_match = +2;

  // 5) Stack familiarity
  const stackHits = STACK_KEYWORDS.filter((k) => haystack.includes(k));
  if (stackHits.length >= 2) breakdown.stack_match = +1;

  // 6) Budget · 500만 이상 우선 · 100만 미만 감점
  if (project.budget_min && project.budget_min >= 5_000_000)
    breakdown.budget_ok = +1;
  if (project.budget_min && project.budget_min < 1_000_000)
    breakdown.budget_low = -1;

  // 7) Duration · 90일 이내 우선
  if (project.duration_days && project.duration_days <= 90)
    breakdown.duration_ok = +1;
  if (project.duration_days && project.duration_days > 180)
    breakdown.duration_long = -1;

  // 8) Competition
  const applicants = project.applicants_count ?? 0;
  if (applicants > 0 && applicants <= 3) breakdown.low_competition = +1;
  if (applicants >= 10) breakdown.high_competition = -1;

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(10, raw));
  return { score, breakdown };
}

// Minimal shape needed for scoring (used by crawler before DB insert)
export type ProjectLike = Pick<
  Project,
  | "title"
  | "description"
  | "category"
  | "skills"
  | "budget_min"
  | "duration_days"
  | "work_type"
  | "contract_type"
  | "applicants_count"
>;
