// ② [증거 모으기] · 채택한 질문의 검색어로 네 칸을 채운다 (D26 ①).
//
// 단계 넷. 화면은 단계마다 서버 액션을 따로 부른다(한 번에 300초를 넘지 않게).
//   search        Europe PMC 조회(정설: 리뷰 상위 10 · 예외 · 기전: 공개 라이선스 상위 15) → LLM 1회 배정 · 문장 후보
//                 → 초록과 글자 그대로 대조 → 통과한 것만 저장
//   premise_body  정설 칸이 비었을 때만 · CC BY 논문 전문의 서론 → LLM 1회 → 본문과 대조(D43) · 전문은 저장하지 않는다
//   industry      LLM 1회로 기업 · 기관 이름 3개 → EDGAR · RePORTER · DART 검색 링크. 자동으로 넣지 않는다
//   retry         문장이 22개 미만이거나 논문 칸이 비면 검색어를 LLM 이 1회 다시 쓰고 search 를 한 번 더
// 결과 요약은 질문의 evidence_run 에 남는다(SQL 전에는 메모 메타 줄).

import type { SupabaseClient } from "@supabase/supabase-js";
import { bodyText, findVerbatim, fullTextXml, introText, searchPapers, type EpmcPaper } from "./epmc";
import { assignAndExtract, industryLeads, premiseFromBody } from "./evidence-llm";
import {
  CARD_TARGET,
  SLOTS,
  bodyCount,
  ensurePaper,
  loadEvidence,
  paperSource,
  storeFact,
} from "./evidence";
import { rewriteQueries } from "./question-llm";
import { loadQuestion, updateQuestion, type Question } from "./questions";
import { PHASES, type EvidenceRun, type IndustryLink, type Phase } from "./collect-types";

export { PHASES, PHASE_LABEL, type EvidenceRun, type IndustryLink, type Phase } from "./collect-types";

const OPEN = `(LICENSE:"cc by" OR LICENSE:"cc0")`;
/** 기전 칸이 비었을 때 검색어에 붙이는 말 (21차 A-3) */
export const MECHANISM_CLAUSE = "(randomized OR crossover OR laboratory OR experimental OR mechanism)";
/** 한 번 실행에 칸마다 넣는 문장 상한 */
const SLOT_CAP = 10;

function emptyRun(queries: string[]): EvidenceRun {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    updatedAt: now,
    queries,
    retryQueries: null,
    phases: [],
    added: 0,
    verifyFailed: 0,
    duplicates: 0,
    llmCalls: 0,
    epmcCalls: 0,
    perSlot: Object.fromEntries(SLOTS.map((s) => [s, { sources: 0, facts: 0 }])) as EvidenceRun["perSlot"],
    total: 0,
    industry: [],
    errors: [],
    seen: [],
    done: false,
  };
}

async function saveRun(db: SupabaseClient, q: Question, run: EvidenceRun) {
  const t = await loadEvidence(db, q.id);
  run.perSlot = Object.fromEntries(
    SLOTS.map((s) => [
      s,
      { sources: t.slots[s].length, facts: t.slots[s].reduce((n, g) => n + g.facts.length, 0) },
    ]),
  ) as EvidenceRun["perSlot"];
  run.total = t.factCount;
  run.updatedAt = new Date().toISOString();
  const { error } = await updateQuestion(db, q.id, {}, { evidence_run: run });
  if (error) throw new Error(`결과 요약을 저장하지 못했습니다: ${error}`);
  return run;
}

// ── search ──────────────────────────────────────────────────────────────────

async function searchPhase(db: SupabaseClient, q: Question, run: EvidenceRun, queries: string[]): Promise<string> {
  const seen = new Set(run.seen);
  const reviews: EpmcPaper[] = [];
  const open: EpmcPaper[] = [];
  const keep = (p: EpmcPaper) => !!p.license && !!p.abstract && !seen.has(p.externalId);

  for (const query of queries.slice(0, 2)) {
    run.epmcCalls += 2;
    for (const p of await searchPapers(`(${query}) AND PUB_TYPE:"review" AND ${OPEN}`, 10)) {
      if (keep(p) && !reviews.some((x) => x.externalId === p.externalId)) reviews.push(p);
    }
    for (const p of await searchPapers(`(${query}) AND ${OPEN}`, 15)) {
      if (keep(p) && !open.some((x) => x.externalId === p.externalId)) open.push(p);
    }
  }
  const pool = [...reviews.slice(0, 10)];
  for (const p of open) {
    if (pool.length >= 25) break;
    if (!pool.some((x) => x.externalId === p.externalId)) pool.push(p);
  }
  pool.forEach((p) => seen.add(p.externalId));
  run.seen = [...seen];
  if (pool.length === 0) return "공개 라이선스 논문을 찾지 못했습니다";

  run.llmCalls += 1;
  const assigned = await assignAndExtract({
    question: q.question,
    premise: q.premise,
    twist: q.twist,
    papers: pool.map((p) => ({ key: p.externalId, title: p.title, abstract: p.abstract, year: p.year, isReview: p.isReview })),
  });

  let added = 0;
  let failed = 0;
  let dup = 0;
  let capped = 0;
  const bySlot: Record<string, number> = {};
  // 한 칸이 카드를 다 차지하지 않게 한 번 실행에 칸마다 SLOT_CAP 문장까지만 넣는다(19차 실측: 예외 22 · 기전 0).
  const before = await loadEvidence(db, q.id);
  const used = (slot: string) =>
    (before.slots[slot as keyof typeof before.slots]?.reduce((n, g) => n + g.facts.length, 0) ?? 0) + (bySlot[slot] ?? 0);
  run.assignments ??= [];
  for (const a of assigned) {
    const title = pool.find((x) => x.externalId === a.key)?.title ?? a.key;
    run.assignments.push({ id: a.key, title, slot: a.slot, reason: a.reason, saved: 0 });
    if (a.slot === "none") continue;
    if (used(a.slot) >= SLOT_CAP) {
      capped += a.sentences.length;
      continue;
    }
    const p = pool.find((x) => x.externalId === a.key)!;
    const passed = a.sentences
      .map((s) => ({ s, hit: findVerbatim(p.abstract, s.text) }))
      .filter((x) => {
        if (!x.hit) failed++;
        return !!x.hit;
      });
    if (passed.length === 0) continue;
    const paperId = await ensurePaper(db, p, "evidence-collect");
    const src = paperSource(paperId, p);
    for (const { s, hit } of passed) {
      const r = await storeFact(
        db,
        q.id,
        a.slot,
        src,
        {
          text: hit!,
          subject: s.subject,
          year: s.year ?? (p.year ? Number(p.year) : null),
          hasNumber: s.hasNumber,
          verifiedAt: new Date().toISOString(),
          sourcePart: "abstract",
        },
        "search",
      );
      if (r === "saved") {
        added++;
        bySlot[a.slot] = (bySlot[a.slot] ?? 0) + 1;
        run.assignments[run.assignments.length - 1].saved++;
      } else dup++;
    }
  }
  run.added += added;
  run.verifyFailed += failed;
  run.duplicates += dup;
  const assignedCount = assigned.filter((a) => a.slot !== "none").length;
  return `논문 ${pool.length}편(리뷰 ${Math.min(reviews.length, 10)}) · 배정 ${assignedCount}편 · 저장 ${added}문장 (${Object.entries(bySlot)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ") || "없음"}) · 대조 실패 ${failed} · 중복 ${dup}${capped ? ` · 칸 상한으로 뺀 후보 ${capped}` : ""}`;
}

// ── premise_body ────────────────────────────────────────────────────────────

async function premiseBodyPhase(db: SupabaseClient, q: Question, run: EvidenceRun): Promise<string> {
  const table = await loadEvidence(db, q.id);
  if (table.slots.premise.some((g) => g.facts.length > 0)) return "정설 칸에 문장이 있어 건너뜁니다";

  // CC BY 리뷰 중 전문이 있는 것. 먼저 이 질문의 검색어로 다시 찾는다(이미 본 목록은 이름만 남아 있다).
  const cands: EpmcPaper[] = [];
  for (const query of (run.retryQueries ?? run.queries).slice(0, 2)) {
    run.epmcCalls += 1;
    for (const p of await searchPapers(`(${query}) AND PUB_TYPE:"review" AND LICENSE:"cc by" AND HAS_FT:y`, 5)) {
      if (p.license === "cc_by" && p.pmcid && !cands.some((x) => x.externalId === p.externalId)) cands.push(p);
    }
  }
  const picked = cands.slice(0, 3);
  if (picked.length === 0) return "전문이 있는 CC BY 리뷰를 찾지 못했습니다";

  const xmls = new Map<string, string>();
  for (const p of picked) {
    run.epmcCalls += 1;
    const xml = await fullTextXml(p.pmcid!);
    if (xml) xmls.set(p.externalId, xml);
  }
  const intros = picked
    .filter((p) => xmls.has(p.externalId))
    .map((p) => ({ key: p.externalId, title: p.title, text: introText(xmls.get(p.externalId)!) }))
    .filter((x) => x.text.length > 200);
  if (intros.length === 0) return "전문 서론을 읽지 못했습니다";

  run.llmCalls += 1;
  const got = await premiseFromBody({ question: q.question, premise: q.premise, intros });

  let added = 0;
  let failed = 0;
  for (const g of got) {
    const p = picked.find((x) => x.externalId === g.key)!;
    const xml = xmls.get(g.key)!;
    const body = bodyText(xml);
    let paperId: string | null = null;
    for (const s of g.sentences) {
      // D43 · 같은 사실이 초록에 있으면 초록을 쓴다.
      const inAbs = findVerbatim(p.abstract, s.text);
      const inBody = inAbs ? null : findVerbatim(body, s.text);
      if (!inAbs && !inBody) {
        failed++;
        continue;
      }
      paperId ??= await ensurePaper(db, p, "evidence-collect");
      const src = paperSource(paperId, p);
      if (!inAbs && bodyCount(await loadEvidence(db, q.id), src.key) >= 2) continue;
      const r = await storeFact(
        db,
        q.id,
        "premise",
        src,
        {
          text: (inAbs ?? inBody)!,
          subject: s.subject,
          year: s.year ?? (p.year ? Number(p.year) : null),
          hasNumber: s.hasNumber,
          verifiedAt: new Date().toISOString(),
          sourcePart: inAbs ? "abstract" : "body",
        },
        "search",
      );
      if (r === "saved") added++;
      else run.duplicates++;
    }
  }
  run.added += added;
  run.verifyFailed += failed;
  return `CC BY 리뷰 전문 ${intros.length}편 서론 · 저장 ${added}문장 · 대조 실패 ${failed}`;
}

// ── mechanism ───────────────────────────────────────────────────────────────

async function mechanismPhase(db: SupabaseClient, q: Question, run: EvidenceRun): Promise<string> {
  const t = await loadEvidence(db, q.id);
  if (t.slots.mechanism.length > 0) return "기전 칸에 원천이 있어 건너뜁니다";
  const base = (run.retryQueries ?? run.queries).slice(0, 2);
  const queries = base.map((x) => `(${x}) AND ${MECHANISM_CLAUSE}`);
  const note = await searchPhase(db, q, run, queries);
  const after = await loadEvidence(db, q.id);
  const facts = after.slots.mechanism.reduce((n, g) => n + g.facts.length, 0);
  return `검색어 끝에 ${MECHANISM_CLAUSE} · ${note} · 기전 칸 원천 ${after.slots.mechanism.length} · 문장 ${facts}`;
}

// ── industry ────────────────────────────────────────────────────────────────

const UA = "gonnim-dominance/1.0 (hi@gonnim.dev)";

async function reporterSearch(text: string): Promise<{ url: string | null; count: number | null }> {
  try {
    const r = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        criteria: { advanced_text_search: { operator: "and", search_field: "projecttitle,abstracttext", search_text: text } },
        limit: 1,
        offset: 0,
        include_fields: ["ApplId"],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { url: null, count: null };
    const d = (await r.json()) as { meta?: { total?: number; properties?: { URL?: string } } };
    // RePORTER 가 "https:/reporter…" 로 슬래시 하나를 빠뜨려 돌려준다(2026-09-30 실측).
    const url = d.meta?.properties?.URL?.replace(/^https:\/(?!\/)/, "https://") ?? null;
    return { url, count: d.meta?.total ?? null };
  } catch {
    return { url: null, count: null };
  }
}

async function industryPhase(q: Question, run: EvidenceRun): Promise<string> {
  run.llmCalls += 1;
  const leads = await industryLeads({ question: q.question, premise: q.premise });
  const out: IndustryLink[] = [];
  for (const l of leads) {
    // EDGAR 는 링크만 둔다. 흔한 이름("Apple")은 건수가 10,000 으로 나와 뜻이 없었다(19차 실측).
    const rep = await reporterSearch(l.query);
    await new Promise((ok) => setTimeout(ok, 1000)); // RePORTER 는 초당 1회
    out.push({
      name: l.name,
      why: l.why,
      query: l.query,
      edgar: { url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(`"${l.name}"`)}` },
      reporter: rep,
      dart: l.koName
        ? `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(l.koName)}`
        : null,
    });
  }
  run.industry = out;
  return `기업 · 기관 ${out.length}곳 링크 (자동으로 넣지 않음)`;
}

// ── retry ───────────────────────────────────────────────────────────────────

async function retryPhase(db: SupabaseClient, q: Question, run: EvidenceRun): Promise<string> {
  const t = await loadEvidence(db, q.id);
  // 22문장 미만이거나, 논문 칸(정설 · 예외 · 기전) 중 빈 칸이 있으면 한 번 더 한다.
  const empty = SLOTS.filter((s) => s !== "industry" && t.slots[s].length === 0).map((s) => s);
  if (t.factCount >= CARD_TARGET && empty.length === 0) return `${t.factCount}문장 · 빈 칸 없음 · 건너뜁니다`;
  if (run.retryQueries) return "이미 한 번 다시 썼습니다";
  run.llmCalls += 1;
  const next = await rewriteQueries({
    question: q.question,
    queries: run.queries,
    failure: `사실 문장 ${t.factCount}/${CARD_TARGET}. 빈 칸: ${empty.join(", ") || "없음"}`,
    reasons: empty.map(
      (s) =>
        `${s} 칸이 비었다. ${s === "mechanism" ? "왜 그런지(원인 · 생리 경로 · 조건)를 보인 연구" : s === "premise" ? "통설과 그 근거를 정리한 리뷰" : "통설을 깨는 관찰 결과"}를 찾는 검색어가 필요하다`,
    ),
  });
  run.retryQueries = next;
  // 기전 칸이 비었으면 다시 쓴 검색어에도 실험 · 기전 말을 붙인다(21차 A-3).
  const searchWith = empty.includes("mechanism") ? next.map((x) => `(${x}) AND ${MECHANISM_CLAUSE}`) : next;
  const note = await searchPhase(db, q, run, searchWith);
  return `새 검색어 ${next.join(" / ")} · ${note}`;
}

// ── 실행 ────────────────────────────────────────────────────────────────────

export async function runPhase(db: SupabaseClient, questionId: string, phase: Phase): Promise<EvidenceRun> {
  const q = await loadQuestion(db, questionId);
  if (!q) throw new Error("질문을 찾지 못했습니다");
  // 채택은 사람이 한다(넘지 않는 선 8). 증거 모으기는 상태를 바꾸지 않으므로 검증 통과 질문에도 돌 수 있다.
  // 채택하면 자동으로 돈다(D26 ①).
  if (!["validated", "adopted", "drafted"].includes(q.status)) {
    throw new Error("검증을 통과했거나 채택한 질문만 증거를 모읍니다");
  }
  const queries = q.searchQueries.slice(0, 2);
  if (queries.length === 0) throw new Error("검색어가 없습니다");

  const prev = q.evidenceRun as EvidenceRun | null;
  const run: EvidenceRun = phase === "search" || !prev ? emptyRun(queries) : prev;
  const t0 = Date.now();
  let note: string;
  try {
    if (phase === "search") note = await searchPhase(db, q, run, queries);
    else if (phase === "premise_body") note = await premiseBodyPhase(db, q, run);
    else if (phase === "mechanism") note = await mechanismPhase(db, q, run);
    else if (phase === "industry") note = await industryPhase(q, run);
    else note = await retryPhase(db, q, run);
  } catch (e) {
    note = `실패 · ${e instanceof Error ? e.message : String(e)}`;
    run.errors.push(`${phase}: ${note}`);
  }
  run.phases.push({ phase, ms: Date.now() - t0, note });
  if (phase === "retry") run.done = true;
  return saveRun(db, q, run);
}

/** 네 단계를 차례로 · 스크립트와 채택 직후 자동 실행이 쓴다. */
export async function collectEvidence(db: SupabaseClient, questionId: string): Promise<EvidenceRun> {
  let run: EvidenceRun | null = null;
  for (const p of PHASES) run = await runPhase(db, questionId, p);
  return run!;
}
