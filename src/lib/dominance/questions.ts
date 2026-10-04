// ① 이슈 고르기 · 질문 행(ds_questions)을 읽고 쓴다 (D24 · D25 · D31 · D39).
//
// 4단계 SQL(db/2026-09-30-dominance-stage4.sql)이 새 칸 네 개를 더한다: area · created_via ·
// source_input · v2_reasons. 운영자가 SQL 을 실행하기 전에도 화면이 돌아야 하므로,
// 새 칸이 없으면 같은 값을 work_note 끝의 메타 줄에 임시로 적는다. SQL 이 그 줄을 칸으로 옮긴다.

import type { SupabaseClient } from "@supabase/supabase-js";

/** 관심 영역 지도 10개 (D41). 분기마다 갱신한다. */
export const AREAS = [
  "건강·의학",
  "노화·장수",
  "뇌·정신",
  "수면",
  "음식",
  "우주·시간",
  "AI·미래",
  "몸의 고장",
  "진화",
  "생활 궁금증",
] as const;
export type Area = (typeof AREAS)[number];

export const SEED_KINDS = ["editorial", "hypothesis", "review_title", "owner", "trend"] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

/** 카드에 쓰는 갈래 이름. 운영자가 만든 이슈는 "직접" 이다. */
export const SEED_LABEL: Record<SeedKind, string> = {
  editorial: "S1 편집",
  hypothesis: "S2 과거 가설",
  review_title: "S3 리뷰 제목",
  owner: "직접",
  trend: "S5 트렌드",
};

export const STATUSES = [
  "proposed",
  "validated",
  "held",
  "rejected",
  "adopted",
  "drafted",
  "published",
] as const;
export type QuestionStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<QuestionStatus, string> = {
  proposed: "제안",
  validated: "검증 통과",
  held: "보류",
  rejected: "기각",
  adopted: "채택",
  drafted: "초안 있음",
  published: "발행됨",
};

export type CreatedVia = "sentence" | "topic" | "link" | "llm";

export const CREATED_VIA_LABEL: Record<CreatedVia, string> = {
  sentence: "문장",
  topic: "주제어",
  link: "링크",
  llm: "제안",
};

/** V2 판정 한 편. 편마다 근거 한 줄을 남긴다 (D31). */
export type V2Reason = {
  id: string;
  title: string;
  year: string | null;
  license: string | null;
  relevant: boolean;
  reason: string;
};

/** [빈 칸 채우기] 결과 · 운영자가 저장하기 전까지 "제안" 으로 보인다. */
export type Suggested = {
  premise?: string;
  twist?: string;
  queries?: string[];
  area?: string;
  series?: string;
  at: string;
};

/** 4단계 SQL 이 칸으로 만드는 값. SQL 전에는 work_note 메타 줄에 산다. */
export type QuestionExt = {
  area?: string | null;
  created_via?: CreatedVia | null;
  source_input?: string | null;
  v2_reasons?: V2Reason[] | null;
  suggested?: Suggested | null;
  /** ② [증거 모으기] 결과 요약 (collect.ts 의 EvidenceRun) */
  evidence_run?: unknown;
};

export type Question = {
  id: string;
  question: string;
  premise: string | null;
  twist: string | null;
  series: string | null;
  searchQueries: string[];
  seedKind: SeedKind;
  /** 사람이 쓴 메모만. 메타 줄은 뺀 값이다. */
  memo: string | null;
  status: QuestionStatus;
  v1Papers5y: number | null;
  v1Reviews: number | null;
  v2RelevantOf5: number | null;
  v3EvidenceOk: boolean | null;
  v4ByYear: Record<string, number | null> | null;
  v4Ratio: number | null;
  v5WikiEn: number | null;
  v5WikiKo: number | null;
  v6MedlinePlus: number | null;
  checkedAt: string | null;
  createdAt: string;
  adoptedAt: string | null;
  area: string | null;
  createdVia: CreatedVia | null;
  sourceInput: string | null;
  v2Reasons: V2Reason[] | null;
  suggested: Suggested | null;
  evidenceRun: unknown;
  /** 재료 네 칸 중 증거가 들어 있는 칸 수 */
  slotsFilled: number;
  /** 사실 카드 문장 수 (D37 목표 22) */
  factCount: number;
};

const BASE_COLUMNS = `
  id, question, premise, twist, series, search_queries, seed_kind, work_note, status,
  v1_papers_5y, v1_reviews, v2_relevant_of_5, v3_evidence_ok, v4_by_year, v4_ratio,
  v5_wiki_en_30d, v5_wiki_ko_30d, v6_medlineplus_topics, checked_at, created_at, adopted_at
`;
const EXT_COLUMNS = "area, created_via, source_input, v2_reasons, suggested, evidence_run";

// ── work_note 메타 줄 ─────────────────────────────────────────────────────────
// 형식: 사람 메모 + 줄바꿈 + "⟦meta⟧" + JSON 한 줄. SQL 의 옮기기 문장이 같은 표시를 찾는다.
export const META_MARK = "⟦meta⟧";

export function splitNote(note: string | null): { memo: string | null; meta: QuestionExt } {
  if (!note) return { memo: null, meta: {} };
  const i = note.indexOf(META_MARK);
  if (i < 0) return { memo: note, meta: {} };
  const memo = note.slice(0, i).trim() || null;
  try {
    return { memo, meta: JSON.parse(note.slice(i + META_MARK.length)) as QuestionExt };
  } catch {
    return { memo, meta: {} };
  }
}

export function joinNote(memo: string | null, meta: QuestionExt): string | null {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined && v !== null),
  );
  const tail = Object.keys(clean).length > 0 ? `${META_MARK}${JSON.stringify(clean)}` : "";
  const text = [memo?.trim() ?? "", tail].filter(Boolean).join("\n");
  return text || null;
}

// ── 새 칸이 있는가 ──────────────────────────────────────────────────────────
// 42703 = undefined_column. 한 요청 안에서 여러 번 묻지 않도록 결과를 넘겨 쓴다.
export async function hasExtColumns(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("ds_questions").select(EXT_COLUMNS).limit(1);
  return !error;
}

type Row = {
  id: string;
  question: string;
  premise: string | null;
  twist: string | null;
  series: string | null;
  search_queries: string[] | null;
  seed_kind: SeedKind;
  work_note: string | null;
  status: QuestionStatus;
  v1_papers_5y: number | null;
  v1_reviews: number | null;
  v2_relevant_of_5: number | null;
  v3_evidence_ok: boolean | null;
  v4_by_year: Record<string, number | null> | null;
  v4_ratio: number | string | null;
  v5_wiki_en_30d: number | null;
  v5_wiki_ko_30d: number | null;
  v6_medlineplus_topics: number | null;
  checked_at: string | null;
  created_at: string;
  adopted_at: string | null;
  area?: string | null;
  created_via?: CreatedVia | null;
  source_input?: string | null;
  v2_reasons?: V2Reason[] | null;
  suggested?: Suggested | null;
  evidence_run?: unknown;
};

function toQuestion(r: Row, counts: { slots: number; facts: number }): Question {
  const { memo, meta } = splitNote(r.work_note);
  return {
    id: r.id,
    question: r.question,
    premise: r.premise,
    twist: r.twist,
    series: r.series,
    searchQueries: r.search_queries ?? [],
    seedKind: r.seed_kind,
    memo,
    status: r.status,
    v1Papers5y: r.v1_papers_5y,
    v1Reviews: r.v1_reviews,
    v2RelevantOf5: r.v2_relevant_of_5,
    v3EvidenceOk: r.v3_evidence_ok,
    v4ByYear: r.v4_by_year,
    v4Ratio: r.v4_ratio === null ? null : Number(r.v4_ratio),
    v5WikiEn: r.v5_wiki_en_30d,
    v5WikiKo: r.v5_wiki_ko_30d,
    v6MedlinePlus: r.v6_medlineplus_topics,
    checkedAt: r.checked_at,
    createdAt: r.created_at,
    adoptedAt: r.adopted_at,
    // 칸이 있으면 칸 값을, 없으면 메타 줄 값을 쓴다.
    area: r.area ?? meta.area ?? null,
    createdVia: r.created_via ?? meta.created_via ?? null,
    sourceInput: r.source_input ?? meta.source_input ?? null,
    v2Reasons: r.v2_reasons ?? meta.v2_reasons ?? null,
    suggested: r.suggested ?? meta.suggested ?? null,
    evidenceRun: r.evidence_run ?? meta.evidence_run ?? null,
    slotsFilled: counts.slots,
    factCount: counts.facts,
  };
}

export type LoadedQuestions = {
  questions: Question[];
  /** 4단계 SQL 이 실행되었는가. 화면이 안내 한 줄을 띄운다. */
  extColumns: boolean;
  error: { code?: string; message: string } | null;
};

export async function loadQuestions(db: SupabaseClient): Promise<LoadedQuestions> {
  const ext = await hasExtColumns(db);
  const { data, error } = await db
    .from("ds_questions")
    .select(ext ? `${BASE_COLUMNS}, ${EXT_COLUMNS}` : BASE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return { questions: [], extColumns: ext, error };

  const rows = (data ?? []) as unknown as Row[];
  const slots = await loadSlotCounts(
    db,
    rows.map((r) => r.id),
  );
  return {
    questions: rows.map((r) => toQuestion(r, slots.get(r.id) ?? { slots: 0, facts: 0 })),
    extColumns: ext,
    error: null,
  };
}

export async function loadQuestion(
  db: SupabaseClient,
  id: string,
): Promise<Question | null> {
  const ext = await hasExtColumns(db);
  const { data } = await db
    .from("ds_questions")
    .select(ext ? `${BASE_COLUMNS}, ${EXT_COLUMNS}` : BASE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const slots = await loadSlotCounts(db, [id]);
  return toQuestion(data as unknown as Row, slots.get(id) ?? { slots: 0, facts: 0 });
}

async function loadSlotCounts(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { slots: number; facts: number }>> {
  const out = new Map<string, { slots: number; facts: number }>();
  if (ids.length === 0) return out;
  const { data } = await db
    .from("ds_question_evidence")
    .select("question_id, slot, fact_sentence")
    .in("question_id", ids);
  const seen = new Map<string, Set<string>>();
  for (const r of (data ?? []) as { question_id: string; slot: string; fact_sentence: string | null }[]) {
    const s = seen.get(r.question_id) ?? new Set<string>();
    s.add(r.slot);
    seen.set(r.question_id, s);
    const c = out.get(r.question_id) ?? { slots: 0, facts: 0 };
    c.facts += (r.fact_sentence ?? "").split("\n").filter((l) => l.trim()).length;
    out.set(r.question_id, c);
  }
  for (const [id, s] of seen) out.get(id)!.slots = s.size;
  return out;
}

/**
 * 새 칸 값을 쓴다. 칸이 있으면 칸에, 없으면 work_note 메타 줄에 쓴다.
 * 다른 칸(rest)도 같은 update 로 보낸다.
 */
export async function updateQuestion(
  db: SupabaseClient,
  id: string,
  rest: Record<string, unknown>,
  ext: QuestionExt,
): Promise<{ error: string | null }> {
  const hasExt = await hasExtColumns(db);
  const patch: Record<string, unknown> = { ...rest };

  if (Object.keys(ext).length > 0) {
    if (hasExt) {
      Object.assign(patch, ext);
    } else {
      const { data } = await db.from("ds_questions").select("work_note").eq("id", id).single();
      const cur = splitNote((data as { work_note: string | null } | null)?.work_note ?? null);
      const memo = "work_note" in rest ? (rest.work_note as string | null) : cur.memo;
      patch.work_note = joinNote(memo, { ...cur.meta, ...ext });
    }
  } else if ("work_note" in rest && !hasExt) {
    // 메모만 고칠 때도 메타 줄은 남긴다.
    const { data } = await db.from("ds_questions").select("work_note").eq("id", id).single();
    const cur = splitNote((data as { work_note: string | null } | null)?.work_note ?? null);
    patch.work_note = joinNote(rest.work_note as string | null, cur.meta);
  }

  const { error } = await db.from("ds_questions").update(patch).eq("id", id);
  return { error: error?.message ?? null };
}

export type NewQuestion = {
  question: string;
  premise: string | null;
  twist: string | null;
  series: string | null;
  searchQueries: string[];
  seedKind: SeedKind;
  memo: string | null;
};

export async function insertQuestion(
  db: SupabaseClient,
  q: NewQuestion,
  ext: QuestionExt,
): Promise<{ id: string | null; error: string | null }> {
  const hasExt = await hasExtColumns(db);
  const row: Record<string, unknown> = {
    question: q.question,
    premise: q.premise,
    twist: q.twist,
    series: q.series,
    search_queries: q.searchQueries,
    seed_kind: q.seedKind,
    status: "proposed",
  };
  if (hasExt) Object.assign(row, { work_note: q.memo, ...ext });
  else row.work_note = joinNote(q.memo, ext);

  const { data, error } = await db.from("ds_questions").insert(row).select("id").single();
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null };
}

/** 같은 문장 판정용. 공백과 끝 물음표 차이는 같은 문장으로 본다. */
export function normalizeQuestion(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[?？]+$/, "").trim();
}

export async function findSameQuestion(
  db: SupabaseClient,
  text: string,
): Promise<{ id: string; question: string; status: QuestionStatus } | null> {
  const target = normalizeQuestion(text);
  if (!target) return null;
  const { data } = await db.from("ds_questions").select("id, question, status");
  const rows = (data ?? []) as { id: string; question: string; status: QuestionStatus }[];
  return rows.find((r) => normalizeQuestion(r.question) === target) ?? null;
}

// ── 카드 줄 ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR"));

/** 검증 줄: V1 5년(리뷰) · V2 n/5 · V4 비율 · V5 en/ko · V6 */
export function validationLine(q: Question): string {
  const v5 = (n: number | null) => (n === null ? "없음" : n.toLocaleString("ko-KR"));
  return [
    `V1 5년 ${fmt(q.v1Papers5y)}(${fmt(q.v1Reviews)})`,
    `V2 ${q.v2RelevantOf5 === null ? "—" : q.v2RelevantOf5}/5`,
    `V3 ${q.v3EvidenceOk === null ? "—" : q.v3EvidenceOk ? "있음" : "없음"}`,
    `V4 ${q.v4Ratio === null ? "—" : q.v4Ratio.toFixed(2)}`,
    `V5 ${q.checkedAt || q.v5WikiEn !== null ? `${v5(q.v5WikiEn)}/${v5(q.v5WikiKo)}` : "—"}`,
    `V6 ${fmt(q.v6MedlinePlus)}`,
  ].join(" · ");
}

/** S2 의 20년 곡선 줄. 연도 칸만 쓴다(36개월 창 값은 뺀다). */
export function curveLine(byYear: Record<string, number | null> | null): string | null {
  if (!byYear) return null;
  const years = Object.entries(byYear)
    .filter(([k, v]) => /^\d{4}$/.test(k) && typeof v === "number")
    .map(([k, v]) => [Number(k), v as number] as const)
    .sort((a, b) => a[0] - b[0]);
  if (years.length < 2) return null;
  const end = years.find(([y]) => y === 2025) ?? years[years.length - 1];
  const start = years.find(([y]) => y >= end[0] - 20) ?? years[0];
  const mid = years
    .filter(([y]) => y > start[0] && y < end[0] && y % 5 === 0)
    .map(([y, v]) => `${y} ${v.toLocaleString("ko-KR")}`);
  return [`${start[0]}년 ${start[1].toLocaleString("ko-KR")}편`, ...mid, `${end[0]}년 ${end[1].toLocaleString("ko-KR")}편`].join(" → ");
}

/** 넘지 않는 선 7 · 8: 검증 통과 질문만 채택할 수 있다. */
/** D31 검증 통과 기준(V1 5년 논문 수 · V2 상위 5편 중 관련 수). validate.ts 가 이 값을 쓴다 */
export const VALIDATION_PASS = { v1: 100, v2: 3 } as const;

/**
 * 48차 B · D52 · 보류 이유. 저장된 V1 · V2 · V3 와 VALIDATION_PASS 로 validate.ts 와 같은 글자를 다시 만든다.
 * 값이 모두 기준 이상인데 보류면 사람이 누른 보류다(「운영자 보류」). 보류가 아니면 null.
 */
export function holdReason(q: Question): string | null {
  if (q.status !== "held") return null;
  const parts = [
    q.v1Papers5y !== null && q.v1Papers5y < VALIDATION_PASS.v1 ? `V1 ${q.v1Papers5y}편 (기준 ${VALIDATION_PASS.v1})` : "",
    q.v2RelevantOf5 !== null && q.v2RelevantOf5 < VALIDATION_PASS.v2 ? `V2 ${q.v2RelevantOf5}/5 (기준 ${VALIDATION_PASS.v2})` : "",
    q.v3EvidenceOk === false ? "V3 관련 있는 공개 라이선스 논문 없음" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "운영자 보류";
}

/** 48차 B · D52 · 보류 카드의 「다음 할 일」 */
export function holdNext(q: Question): string[] {
  if (q.status !== "held") return [];
  const out: string[] = [];
  if (q.v1Papers5y !== null && q.v1Papers5y < VALIDATION_PASS.v1) out.push("검색어(영어)를 더 넓게 고치고 다시 검증");
  if (q.v2RelevantOf5 !== null && q.v2RelevantOf5 < VALIDATION_PASS.v2) out.push("질문이나 검색어를 더 좁게 고치고 다시 검증");
  if (q.v3EvidenceOk === false)
    out.push("공개 라이선스 논문이 없어 문장을 인용할 수 없습니다. 검색어를 바꿔 다시 검증하거나 기각");
  return out.length ? out : ["검증을 다시 누르거나 기각"];
}

/** 48차 B · 카드 상태 글자 옆 작은 회색 글자(다음 동작). STATUS_LABEL 은 그대로 둔다 */
export const STATUS_NEXT: Partial<Record<QuestionStatus, string>> = {
  proposed: "검증 전",
  validated: "채택 가능",
  held: "이유 아래",
  adopted: "글 작성 가능",
  drafted: "글 있음",
};

export function canAdopt(q: Question): boolean {
  return q.status === "validated" && q.v3EvidenceOk === true;
}
