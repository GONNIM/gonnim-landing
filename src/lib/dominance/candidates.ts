// 후보 생성 · 모아 둔 원천에서 오늘의 후보 10개를 뽑는다.
//
// 세 단계다. ① 글자만 보고 전부 점수를 매긴다(돈이 들지 않는다).
// ② 상위 24건만 LLM 에 한 번 보내 역설·반직관을 찾고 한국어 제목을 받는다.
// ③ 역설 점수를 더해 다시 줄을 세우고 위에서 10건을 넣는다.
//
// 같은 논문을 두 번 후보로 올리지 않는다. 이미 후보가 된 원천 ID 를 먼저 읽어 뺀다.

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { kstDateAfter, kstToday } from "./kst";
import {
  applyParadox,
  meetsTrustFloor,
  scoreWithoutLlm,
  totalScore,
  type ScoreInput,
} from "./score";
import type { ScoreBreakdown } from "./types";

const DEFAULT_MODEL = "glm-5.2";
const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

/** LLM 에 물어보는 상위 건수. 여기서 10건을 고르므로 여유를 둔다. */
const LLM_POOL_SIZE = 24;
/** 하루에 넣는 후보 수. */
const DAILY_LIMIT = 10;
/** 원천을 거슬러 보는 날 수. 재고가 마르지 않게 2주를 본다. */
const LOOKBACK_DAYS = 14;
/** 한 건당 LLM 에 보내는 초록 길이. 전부 보내면 한 번에 들어가지 않는다. */
const ABSTRACT_CHARS = 700;

export type BuildReport = {
  candidateDate: string;
  scanned: number;
  alreadyUsed: number;
  trustRejected: number;
  askedLlm: number;
  inserted: number;
  /** 넣은 후보를 점수 순으로. 크론 경보와 손 실행이 같은 것을 본다. */
  saved: { headline: string; score: number; paradoxLine: string | null }[];
  errors: string[];
};

type Source = {
  kind: "paper" | "press";
  rowId: string;
  title: string;
  abstract: string | null;
  publishedDate: string | null;
};

type Scored = Source & { breakdown: ScoreBreakdown; total: number };

type Verdict = {
  headline: string;
  hook: string | null;
  paradoxLine: string | null;
  counterintuitive: boolean;
};

async function loadUsedIds(
  db: SupabaseClient,
): Promise<{ papers: Set<string>; press: Set<string> }> {
  const { data, error } = await db
    .from("ds_candidates")
    .select("paper_id, gov_press_id");

  if (error) throw new Error(`기존 후보를 읽지 못했습니다: ${error.message}`);

  const papers = new Set<string>();
  const press = new Set<string>();
  for (const r of data ?? []) {
    if (r.paper_id) papers.add(r.paper_id as string);
    if (r.gov_press_id) press.add(r.gov_press_id as string);
  }
  return { papers, press };
}

async function loadSources(db: SupabaseClient, since: string): Promise<Source[]> {
  const [papers, press] = await Promise.all([
    db
      .from("ds_papers")
      .select("id, title, abstract, published_date")
      .gte("published_date", since)
      .order("published_date", { ascending: false })
      .limit(500),
    db
      .from("ds_gov_press")
      .select("id, title, body, published_date")
      .gte("published_date", since)
      .order("published_date", { ascending: false })
      .limit(200),
  ]);

  if (papers.error) throw new Error(`ds_papers 읽기 실패: ${papers.error.message}`);
  if (press.error) throw new Error(`ds_gov_press 읽기 실패: ${press.error.message}`);

  return [
    ...(papers.data ?? []).map((r) => ({
      kind: "paper" as const,
      rowId: r.id as string,
      title: r.title as string,
      abstract: (r.abstract as string | null) ?? null,
      publishedDate: (r.published_date as string | null) ?? null,
    })),
    ...(press.data ?? []).map((r) => ({
      kind: "press" as const,
      rowId: r.id as string,
      title: r.title as string,
      abstract: (r.body as string | null) ?? null,
      publishedDate: (r.published_date as string | null) ?? null,
    })),
  ];
}

const SYSTEM_INSTRUCTIONS = `당신은 한국어 연구·보건 뉴스레터의 후보 선별자다.
연구 초록과 정부 보도자료를 읽고, 각 건이 통설을 깨는지 판정한다.

# 판정 기준
- paradox_line: 이 자료가 깨는 통설을 한 문장으로 쓴다. 통설이 분명하지 않으면 null 을 쓴다.
  형식은 "흔히 A 라고 알려져 있지만 B 였다" 이다. 초록에 근거가 없으면 지어내지 않는다.
- counterintuitive: 결과가 상식과 반대 방향이면 true, 예상대로면 false 로 쓴다.
- headline: 한국어 제목을 40자 이내로 쓴다. 초록에 없는 사실을 넣지 않는다.
- hook: 독자가 왜 읽어야 하는지를 한 문장으로 쓴다. 60자 이내로 쓰고 물음표로 끝낸다.

# 넘지 않는 선
- 초록에 없는 수치나 결론을 쓰지 않는다.
- 의학적 지시를 하지 않는다.
- 통설이 없는 평범한 자료에 억지로 역설을 붙이지 않는다. 그럴 때 paradox_line 은 null 이다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다. 받은 건수와 같은 개수를 같은 번호로 반환한다.
{"items":[{"n":1,"headline":"...","hook":"...","paradox_line":null,"counterintuitive":false}]}`;

function renderPool(pool: Scored[]): string {
  const blocks = pool
    .map((s, i) => {
      const body = s.abstract
        ? s.abstract.slice(0, ABSTRACT_CHARS)
        : "(초록 없음 — 제목만으로 판정하고 역설은 null 로 두시오)";
      return [
        `[${i + 1}] ${s.kind === "paper" ? "1차 연구" : "정부 보도자료"} · ${s.publishedDate ?? "-"}`,
        `제목: ${s.title}`,
        `내용: ${body}`,
      ].join("\n");
    })
    .join("\n\n");

  return `다음 ${pool.length}건을 각각 판정하시오.\n\n${blocks}`;
}

function parseVerdicts(raw: string, pool: Scored[]): Map<number, Verdict> {
  const json = raw.trim().replace(/^```(?:json)?\n?|\n?```$/g, "");

  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    // 응답 앞뒤를 함께 남긴다. 잘렸는지 설명이 섞였는지 이것으로 구분한다.
    throw new Error(
      `GLM 응답이 JSON 이 아닙니다 (${json.length}자) · 앞 ${json.slice(0, 120)} … 뒤 ${json.slice(-120)}`,
    );
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const out = new Map<number, Verdict>();

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const n = typeof r.n === "number" ? r.n : Number(r.n);
    if (!Number.isInteger(n) || n < 1 || n > pool.length) continue;

    const headline = typeof r.headline === "string" ? r.headline.trim() : "";
    if (!headline) continue;

    const hook = typeof r.hook === "string" ? r.hook.trim() : "";
    const paradox =
      typeof r.paradox_line === "string" && r.paradox_line.trim()
        ? r.paradox_line.trim()
        : null;

    out.set(n - 1, {
      headline,
      hook: hook || null,
      paradoxLine: paradox,
      counterintuitive: r.counterintuitive === true,
    });
  }

  return out;
}

/** 상위 후보를 한 번에 물어본다. 키가 없거나 실패하면 글자 점수만으로 진행한다. */
async function askParadox(pool: Scored[]): Promise<Map<number, Verdict>> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error("ZAI_API_KEY 없음 · 역설 판정을 건너뜁니다");

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
  });

  const response = await client.chat.completions.create({
    model: process.env.ZAI_MODEL || DEFAULT_MODEL,
    temperature: 0.3,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: renderPool(pool) },
    ],
    // @ts-expect-error z.ai 확장 파라미터 · OpenAI SDK 타입에는 없으나 서버는 수용
    thinking: { type: "disabled" },
  });

  const choice = response.choices[0];
  const content = choice?.message?.content;
  if (!content) throw new Error(`GLM 응답이 비었습니다 (${choice?.finish_reason})`);
  if (choice.finish_reason === "length") {
    throw new Error("GLM 응답이 길이 제한에 걸려 잘렸습니다");
  }

  return parseVerdicts(content, pool);
}

export async function buildCandidates(
  db: SupabaseClient,
  options: { date?: string; limit?: number } = {},
): Promise<BuildReport> {
  const candidateDate = options.date ?? kstToday();
  const limit = options.limit ?? DAILY_LIMIT;
  const errors: string[] = [];

  // 그 날짜에 후보가 이미 있으면 아무것도 하지 않는다. 크론이 다시 돌 수 있고,
  // 그때 또 10건을 넣으면 하루 후보가 20건이 되어 무엇을 고를지 알 수 없게 된다.
  const existing = await db
    .from("ds_candidates")
    .select("id", { count: "exact", head: true })
    .eq("candidate_date", candidateDate);

  if ((existing.count ?? 0) > 0) {
    return {
      candidateDate,
      scanned: 0,
      alreadyUsed: 0,
      trustRejected: 0,
      askedLlm: 0,
      inserted: 0,
      saved: [],
      errors: [`${candidateDate} 후보가 이미 ${existing.count}건 있습니다`],
    };
  }

  const used = await loadUsedIds(db);
  const sources = await loadSources(db, kstDateAfter(-LOOKBACK_DAYS));

  let alreadyUsed = 0;
  let trustRejected = 0;
  const scored: Scored[] = [];

  for (const s of sources) {
    const seen = s.kind === "paper" ? used.papers : used.press;
    if (seen.has(s.rowId)) {
      alreadyUsed += 1;
      continue;
    }

    const input: ScoreInput = {
      title: s.title,
      abstract: s.abstract,
      publishedDate: s.publishedDate,
      kind: s.kind,
    };
    const breakdown = scoreWithoutLlm(input);

    // 신뢰 하한이 먼저다. 흥미가 아무리 높아도 여기서 걸리면 올리지 않는다.
    if (!meetsTrustFloor(breakdown)) {
      trustRejected += 1;
      continue;
    }

    scored.push({ ...s, breakdown, total: totalScore(breakdown) });
  }

  scored.sort((a, b) => b.total - a.total);
  const pool = scored.slice(0, LLM_POOL_SIZE);

  let verdicts = new Map<number, Verdict>();
  if (pool.length > 0) {
    try {
      verdicts = await askParadox(pool);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // 판정이 없는 건은 넣지 않는다. 논문 제목은 영어이므로 한국어 제목이 없으면
  // 콘솔에 영어 제목이 그대로 올라간다. 후보가 0건인 편이 그것보다 낫다.
  const finals = pool
    .map((s, i) => ({ source: s, verdict: verdicts.get(i) }))
    .filter((x): x is { source: Scored; verdict: Verdict } => x.verdict !== undefined)
    .map(({ source, verdict }) => {
      const breakdown = applyParadox(source.breakdown, {
        paradoxLine: verdict.paradoxLine,
        counterintuitive: verdict.counterintuitive,
      });
      return {
        source,
        headline: verdict.headline.slice(0, 200),
        hook: verdict.hook,
        breakdown,
        total: totalScore(breakdown),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  if (finals.length === 0) {
    return {
      candidateDate,
      scanned: sources.length,
      alreadyUsed,
      trustRejected,
      askedLlm: pool.length,
      inserted: 0,
      saved: [],
      errors,
    };
  }

  const { data, error } = await db
    .from("ds_candidates")
    .insert(
      finals.map((f) => ({
        candidate_date: candidateDate,
        paper_id: f.source.kind === "paper" ? f.source.rowId : null,
        gov_press_id: f.source.kind === "press" ? f.source.rowId : null,
        headline: f.headline,
        hook: f.hook,
        score: f.total,
        score_breakdown: f.breakdown,
        state: "open",
      })),
    )
    .select("id");

  if (error) errors.push(`ds_candidates 저장 실패: ${error.message}`);

  return {
    candidateDate,
    scanned: sources.length,
    alreadyUsed,
    trustRejected,
    askedLlm: pool.length,
    inserted: data?.length ?? 0,
    saved: finals.map((f) => ({
      headline: f.headline,
      score: f.total,
      paradoxLine: f.breakdown.interest.paradoxLine,
    })),
    errors,
  };
}
