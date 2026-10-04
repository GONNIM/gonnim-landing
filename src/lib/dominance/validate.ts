// ⓪-2 [검증] · 질문 하나를 D31 기준으로 잰다.
//
// Europe PMC 호출 5회: 최근 5년 수 · 그중 리뷰 수 · 최근 36개월 · 그 전 36개월 · 상위 5편(라이선스 포함).
// V2 는 LLM 1회로 편마다 근거 한 줄을 남긴다. V5 는 위키백과 en · ko, V6 은 MedlinePlus.
// 통과 조건은 V1 100편 이상 · V2 3/5 이상 · V3 1편 이상(D31). 못 넘으면 검색어를 1회 다시 쓰고
// 다시 잰다. 그래도 못 넘으면 held 다. rejected 는 사람만 누른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { judgeRelevance, rewriteQueries } from "./question-llm";
import { loadQuestion, updateQuestion, VALIDATION_PASS, type V2Reason } from "./questions";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const UA = "gonnim-dominance-validation/1.0 (hi@gonnim.dev)";

// 48차 B · 기준 숫자는 화면도 읽으므로 questions.ts 에 둔다(값은 그대로 · D31)
export const PASS = VALIDATION_PASS;

/** 재사용과 발췌를 허락하는 라이선스만 V3 로 센다 (넘지 않는 선 3). */
const OPEN_LICENSES = new Set(["cc0", "cc by", "cc-by", "public domain", "pd"]);

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// Europe PMC 는 저녁 시간에 503 을 자주 준다(2026-09-28 실측). 간격을 늘리며 세 번까지 묻는다.
async function epmc(params: Record<string, string>): Promise<Record<string, unknown>> {
  let last = "";
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500 * i * i + 500);
    try {
      const res = await fetch(`${EPMC}?${new URLSearchParams({ ...params, format: "json" })}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
  }
  throw new Error(`Europe PMC 응답 없음 (${last})`);
}

async function count(query: string): Promise<number> {
  const d = await epmc({ query, pageSize: "1", resultType: "idlist" });
  return Number(d.hitCount ?? 0);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function windows(now: Date) {
  const minus = (months: number) => {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - months);
    return d;
  };
  const a = minus(36);
  const b = minus(72);
  const aPrev = new Date(a);
  aPrev.setUTCDate(aPrev.getUTCDate() - 1);
  return {
    recent: `FIRST_PDATE:[${ymd(a)} TO ${ymd(now)}]`,
    prev: `FIRST_PDATE:[${ymd(b)} TO ${ymd(aPrev)}]`,
  };
}

type Top = { id: string; title: string; year: string | null; license: string | null; abstract: string };

export type Measure = {
  query: string;
  v1: number;
  v1Reviews: number;
  recent36: number;
  prev36: number;
  ratio: number | null;
  top: Top[];
  epmcCalls: number;
  epmcMs: number;
};

/** Europe PMC 5회. 차례로 부른다 — 동시에 부르면 503 이 먼저 온다. */
export async function measureQuery(query: string, now = new Date()): Promise<Measure> {
  const t0 = Date.now();
  const y = now.getUTCFullYear();
  const five = `(${query}) AND PUB_YEAR:[${y - 5} TO ${y}]`;
  const w = windows(now);

  const v1 = await count(five);
  await sleep(300);
  const v1Reviews = await count(`${five} AND PUB_TYPE:"review"`);
  await sleep(300);
  const recent36 = await count(`(${query}) AND ${w.recent}`);
  await sleep(300);
  const prev36 = await count(`(${query}) AND ${w.prev}`);
  await sleep(300);
  const d = await epmc({ query: five, pageSize: "5", resultType: "core" });

  const list = ((d.resultList as { result?: unknown[] } | undefined)?.result ?? []) as Record<
    string,
    unknown
  >[];
  const top: Top[] = list.slice(0, 5).map((x) => ({
    id: `${x.source}/${x.id}`,
    title: String(x.title ?? "").replace(/<[^>]+>/g, "").trim(),
    year: (x.pubYear as string) ?? null,
    license: (x.license as string) ?? null,
    abstract: String(x.abstractText ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));

  return {
    query,
    v1,
    v1Reviews,
    recent36,
    prev36,
    ratio: prev36 > 0 ? Math.round((recent36 / prev36) * 100) / 100 : null,
    top,
    epmcCalls: 5,
    epmcMs: Date.now() - t0,
  };
}

// ── V5 위키백과 · V6 MedlinePlus ────────────────────────────────────────────

async function wikiViews(lang: "en" | "ko", title: string | null, now: Date): Promise<number | null> {
  if (!title) return null;
  try {
    const q = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", titles: title, redirects: "1", format: "json" })}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) },
    ).then((r) => r.json() as Promise<{ query?: { pages?: Record<string, { title: string; missing?: string }> } }>);
    const page = Object.values(q.query?.pages ?? {}).find((p) => !("missing" in p));
    if (!page) return null; // 문서 없음

    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    const d8 = (d: Date) => ymd(d).replace(/-/g, "");
    const t = encodeURIComponent(page.title.replace(/ /g, "_"));
    const v = await fetch(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${t}/daily/${d8(start)}/${d8(end)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) },
    ).then((r) => r.json() as Promise<{ items?: { views: number }[] }>);
    return (v.items ?? []).reduce((s, i) => s + i.views, 0);
  } catch {
    return null;
  }
}

async function medlinePlusTopics(term: string | null): Promise<number | null> {
  if (!term) return null;
  try {
    const xml = await fetch(
      `https://wsearch.nlm.nih.gov/ws/query?${new URLSearchParams({ db: "healthTopics", term, retmax: "1" })}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) },
    ).then((r) => r.text());
    const m = xml.match(/<count>(\d+)<\/count>/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// ── 한 번 재기 ──────────────────────────────────────────────────────────────

type Attempt = {
  measure: Measure;
  reasons: V2Reason[];
  v2: number;
  v3: boolean;
  names: { wikiEn: string | null; wikiKo: string | null; medline: string | null };
  failure: string | null;
  llmMs: number;
};

async function attempt(question: string, premise: string | null, query: string): Promise<Attempt> {
  const measure = await measureQuery(query);
  const t = Date.now();
  const judged = await judgeRelevance({
    question,
    premise,
    papers: measure.top.map((p) => ({ id: p.id, title: p.title, abstract: p.abstract })),
  });
  const llmMs = Date.now() - t;

  const reasons: V2Reason[] = measure.top.map((p) => {
    const v = judged.verdicts.find((x) => x.id === p.id);
    return {
      id: p.id,
      title: p.title,
      year: p.year,
      license: p.license,
      relevant: v?.relevant ?? false,
      reason: v?.reason ?? "판정 없음",
    };
  });
  const v2 = reasons.filter((r) => r.relevant).length;
  const v3 = reasons.some((r) => r.relevant && OPEN_LICENSES.has((r.license ?? "").toLowerCase()));

  const failure = [
    measure.v1 < PASS.v1 ? `V1 ${measure.v1}편 (기준 ${PASS.v1})` : "",
    v2 < PASS.v2 ? `V2 ${v2}/5 (기준 ${PASS.v2})` : "",
    !v3 ? "V3 관련 있는 공개 라이선스 논문 없음" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    measure,
    reasons,
    v2,
    v3,
    names: { wikiEn: judged.wikiEn, wikiKo: judged.wikiKo, medline: judged.medline },
    failure: failure || null,
    llmMs,
  };
}

export type ValidationResult = {
  ok: boolean;
  status: "validated" | "held";
  rewritten: boolean;
  queries: string[];
  failure: string | null;
  v1: number;
  v1Reviews: number;
  v2: number;
  v3: boolean;
  ratio: number | null;
  wikiEn: number | null;
  wikiKo: number | null;
  medline: number | null;
  epmcCalls: number;
  llmCalls: number;
  ms: { total: number; epmc: number; llm: number; signals: number };
};

/** 질문 하나를 재고 DB 에 적는다. 채택 이후 상태는 다시 재지 않는다. */
export async function validateQuestion(
  db: SupabaseClient,
  id: string,
): Promise<ValidationResult> {
  const t0 = Date.now();
  const q = await loadQuestion(db, id);
  if (!q) throw new Error("질문을 찾지 못했습니다");
  if (!["proposed", "validated", "held"].includes(q.status)) {
    throw new Error(`이 상태(${q.status})의 질문은 다시 재지 않습니다`);
  }
  if (q.searchQueries.length === 0) throw new Error("검색어가 없습니다. 검색어를 먼저 적으십시오");

  let queries = q.searchQueries;
  let llmCalls = 1;
  let epmcMs = 0;
  let llmMs = 0;

  let a = await attempt(q.question, q.premise, queries[0]);
  epmcMs += a.measure.epmcMs;
  llmMs += a.llmMs;
  let rewritten = false;

  if (a.failure) {
    // 검색어를 한 번 다시 쓰고 다시 잰다 (D31).
    const t = Date.now();
    const next = await rewriteQueries({
      question: q.question,
      queries,
      failure: a.failure,
      reasons: a.reasons.map((r) => `${r.relevant ? "관련" : "무관"} · ${r.title} — ${r.reason}`),
    });
    llmMs += Date.now() - t;
    llmCalls += 2;
    const b = await attempt(q.question, q.premise, next[0]);
    epmcMs += b.measure.epmcMs;
    llmMs += b.llmMs;
    rewritten = true;
    // 다시 쓴 쪽이 통과하면 그 검색어를 쓴다. 둘 다 못 넘으면 V2 가 나은 쪽을 남긴다.
    if (!b.failure || b.v2 >= a.v2) {
      a = b;
      queries = next;
    }
  }

  const ts = Date.now();
  const [wikiEn, wikiKo, medline] = await Promise.all([
    wikiViews("en", a.names.wikiEn, new Date()),
    wikiViews("ko", a.names.wikiKo, new Date()),
    medlinePlusTopics(a.names.medline),
  ]);
  const signalsMs = Date.now() - ts;

  const status = a.failure ? "held" : "validated";
  const byYear = {
    ...(q.v4ByYear ?? {}),
    "36m_recent": a.measure.recent36,
    "36m_prev": a.measure.prev36,
  };

  const { error } = await updateQuestion(
    db,
    id,
    {
      search_queries: queries,
      status,
      v1_papers_5y: a.measure.v1,
      v1_reviews: a.measure.v1Reviews,
      v2_relevant_of_5: a.v2,
      v3_evidence_ok: a.v3,
      v4_ratio: a.measure.ratio,
      v4_by_year: byYear,
      v5_wiki_en_30d: wikiEn,
      v5_wiki_ko_30d: wikiKo,
      v6_medlineplus_topics: medline,
      checked_at: new Date().toISOString(),
    },
    { v2_reasons: a.reasons },
  );
  if (error) throw new Error(`검증 값을 저장하지 못했습니다: ${error}`);

  return {
    ok: !a.failure,
    status,
    rewritten,
    queries,
    failure: a.failure,
    v1: a.measure.v1,
    v1Reviews: a.measure.v1Reviews,
    v2: a.v2,
    v3: a.v3,
    ratio: a.measure.ratio,
    wikiEn,
    wikiKo,
    medline,
    epmcCalls: rewritten ? 10 : 5,
    llmCalls,
    ms: { total: Date.now() - t0, epmc: epmcMs, llm: llmMs, signals: signalsMs },
  };
}

/** S3 리뷰 제목 변환의 재료 · 최근 30일 리뷰 논문 제목. LLM 호출이 아니다. */
export async function recentReviewTitles(now = new Date()): Promise<string[]> {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const d = await epmc({
    query: `PUB_TYPE:"review" AND FIRST_PDATE:[${ymd(from)} TO ${ymd(now)}] AND (LICENSE:"cc by" OR LICENSE:"cc0") AND SRC:MED`,
    pageSize: "40",
    resultType: "lite",
  });
  const list = ((d.resultList as { result?: unknown[] } | undefined)?.result ?? []) as Record<
    string,
    unknown
  >[];
  return list.map((x) => String(x.title ?? "").replace(/<[^>]+>/g, "").trim()).filter(Boolean);
}
