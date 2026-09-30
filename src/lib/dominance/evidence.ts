// ② 증거 표 · 질문의 재료 네 칸(정설 · 예외 · 기전 · 산업)과 사실 문장 (D26 · D33 · D37 · D43).
//
// 저장 형태가 둘이다.
// - 4단계 SQL 전: 한 행 = (칸, 원천). 문장 여러 개를 fact_sentence 에 줄바꿈으로 잇고, 문장마다의
//   대상 · 연도 · 수치 · 대조 시각 · 뽑은 곳은 note 끝 "⟦meta⟧{"facts":[…]}" 줄에 같은 순서로 둔다.
//   (옛 유일 인덱스가 같은 칸 · 같은 원천 두 행을 막는다.)
// - 4단계 SQL 뒤: 새 문장은 한 행에 하나씩 넣고 새 칸(fact_subject 등)에 적는다.
//   SQL 전에 묶어 둔 행은 그대로 읽는다. 고칠 때만 그 행 안에서 고친다.
// 읽기는 두 형태를 모두 문장 단위로 편다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bodyText, cleanMarkup, findVerbatim, fullTextXml, paperById, type EpmcPaper } from "./epmc";

export const SLOTS = ["premise", "exception", "mechanism", "industry"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  premise: "정설",
  exception: "예외",
  mechanism: "기전",
  industry: "산업",
};
export const SLOT_LETTER: Record<Slot, string> = { premise: "P", exception: "E", mechanism: "M", industry: "I" };

/** 카드 목표 문장 수 (D37) */
export const CARD_TARGET = 22;
/** D43 · 원천당 본문 문장 상한 */
export const BODY_LIMIT = 2;

export const EXT_KINDS = [
  "disclosure_kr",
  "disclosure_us",
  "grant",
  "registry",
  "company_press",
  "news",
  "agency",
] as const;
export const EXT_KIND_LABEL: Record<string, string> = {
  disclosure_kr: "국내 공시",
  disclosure_us: "미국 공시",
  grant: "연구비",
  registry: "임상 등록",
  company_press: "기업 보도자료",
  news: "기사",
  agency: "기관 고지",
  own: "자체 집계",
};
export const EXT_LICENSES = ["cc0", "cc_by", "public_domain", "kogl_1", "link_only"] as const;
export const LICENSE_LABEL: Record<string, string> = {
  cc0: "CC0",
  cc_by: "CC BY",
  public_domain: "퍼블릭 도메인",
  kogl_1: "공공누리 1유형",
  link_only: "링크만",
};

export type SourcePart = "abstract" | "body" | "memo";
export const SOURCE_PART_LABEL: Record<SourcePart, string> = { abstract: "초록", body: "본문", memo: "메모" };

type FactMeta = {
  subject?: string | null;
  year?: number | null;
  has_number?: boolean | null;
  verified_at?: string | null;
  source_part?: SourcePart | null;
};

export type Fact = {
  rowId: string;
  line: number;
  text: string;
  subject: string | null;
  year: number | null;
  hasNumber: boolean | null;
  verifiedAt: string | null;
  sourcePart: SourcePart | null;
  addedBy: string;
};

export type SourceRef = {
  key: string;
  kind: "paper" | "press" | "ext";
  paperId: string | null;
  pressId: string | null;
  extUrl: string | null;
  externalId: string | null;
  title: string;
  url: string;
  license: string | null;
  extKind: string | null;
  tag: string | null;
  linkOnly: boolean;
};

export type SourceGroup = {
  source: SourceRef;
  rowIds: string[];
  facts: Fact[];
  /** 사람 메모(메타 줄 뺀 note). link_only 원천의 "우리 말" 메모가 여기 있다. */
  notes: string[];
};

export type EvidenceTable = {
  questionId: string;
  slots: Record<Slot, SourceGroup[]>;
  factCount: number;
  filledSlots: number;
  extColumns: boolean;
};

const META = "⟦meta⟧";
const BASE = `
  id, question_id, paper_id, gov_press_id, ext_url, ext_title, ext_source_kind, license, tag,
  fact_sentence, slot, added_by, note, created_at,
  paper:ds_papers!ds_question_evidence_paper_id_fkey ( external_id, title, landing_url, license ),
  press:ds_gov_press!ds_question_evidence_gov_press_id_fkey ( title, landing_url )
`;
const EXT = "fact_subject, fact_year, has_number, verified_at, source_part";

type Row = {
  id: string;
  question_id: string;
  paper_id: string | null;
  gov_press_id: string | null;
  ext_url: string | null;
  ext_title: string | null;
  ext_source_kind: string | null;
  license: string | null;
  tag: string | null;
  fact_sentence: string | null;
  slot: Slot;
  added_by: string;
  note: string | null;
  created_at: string;
  paper: { external_id: string; title: string; landing_url: string; license: string } | null;
  press: { title: string; landing_url: string } | null;
  fact_subject?: string | null;
  fact_year?: number | null;
  has_number?: boolean | null;
  verified_at?: string | null;
  source_part?: SourcePart | null;
};

// ── 메모 · 메타 줄 ──────────────────────────────────────────────────────────

function splitNote(note: string | null): { memo: string | null; facts: FactMeta[] } {
  if (!note) return { memo: null, facts: [] };
  const i = note.indexOf(META);
  if (i < 0) return { memo: note, facts: [] };
  const memo = note.slice(0, i).trim() || null;
  try {
    const m = JSON.parse(note.slice(i + META.length)) as { facts?: FactMeta[] };
    return { memo, facts: m.facts ?? [] };
  } catch {
    return { memo, facts: [] };
  }
}

function joinNote(memo: string | null, facts: FactMeta[]): string | null {
  const any = facts.some((f) => f && Object.values(f).some((v) => v !== null && v !== undefined));
  const tail = any ? `${META}${JSON.stringify({ facts })}` : "";
  return [memo?.trim() ?? "", tail].filter(Boolean).join("\n") || null;
}

const lines = (s: string | null) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

export async function hasEvidenceColumns(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("ds_question_evidence").select(EXT).limit(1);
  return !error;
}

async function loadRows(db: SupabaseClient, questionId: string, ext: boolean): Promise<Row[]> {
  const { data, error } = await db
    .from("ds_question_evidence")
    .select(ext ? `${BASE}, ${EXT}` : BASE)
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`증거를 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

function sourceOf(r: Row): SourceRef {
  if (r.paper_id) {
    return {
      key: `paper:${r.paper_id}`,
      kind: "paper",
      paperId: r.paper_id,
      pressId: null,
      extUrl: null,
      externalId: r.paper?.external_id ?? null,
      title: r.paper?.title ?? "(제목 없음)",
      url: r.paper?.landing_url ?? "",
      license: r.license ?? r.paper?.license ?? null,
      extKind: null,
      tag: r.tag,
      linkOnly: false,
    };
  }
  if (r.gov_press_id) {
    return {
      key: `press:${r.gov_press_id}`,
      kind: "press",
      paperId: null,
      pressId: r.gov_press_id,
      extUrl: null,
      externalId: null,
      title: r.press?.title ?? "(제목 없음)",
      url: r.press?.landing_url ?? "",
      license: r.license ?? "kogl_1",
      extKind: null,
      tag: r.tag,
      linkOnly: false,
    };
  }
  return {
    key: `ext:${r.ext_url}`,
    kind: "ext",
    paperId: null,
    pressId: null,
    extUrl: r.ext_url,
    externalId: null,
    title: r.ext_title ?? r.ext_url ?? "",
    url: r.ext_url ?? "",
    license: r.license,
    extKind: r.ext_source_kind,
    tag: r.tag,
    linkOnly: r.license === "link_only",
  };
}

function factsOf(r: Row): Fact[] {
  const ls = lines(r.fact_sentence);
  const { facts: meta } = splitNote(r.note);
  const cols: FactMeta | null =
    ls.length === 1 &&
    [r.fact_subject, r.fact_year, r.has_number, r.verified_at, r.source_part].some(
      (v) => v !== null && v !== undefined,
    )
      ? {
          subject: r.fact_subject,
          year: r.fact_year,
          has_number: r.has_number,
          verified_at: r.verified_at,
          source_part: r.source_part,
        }
      : null;
  return ls.map((text, i) => {
    const m = cols ?? meta[i] ?? {};
    return {
      rowId: r.id,
      line: i,
      text,
      subject: m.subject ?? null,
      year: m.year ?? null,
      hasNumber: m.has_number ?? null,
      verifiedAt: m.verified_at ?? null,
      sourcePart: m.source_part ?? null,
      addedBy: r.added_by,
    };
  });
}

export async function loadEvidence(db: SupabaseClient, questionId: string): Promise<EvidenceTable> {
  const ext = await hasEvidenceColumns(db);
  const rows = await loadRows(db, questionId, ext);
  const slots = Object.fromEntries(SLOTS.map((s) => [s, [] as SourceGroup[]])) as Record<Slot, SourceGroup[]>;

  for (const r of rows) {
    const src = sourceOf(r);
    const list = slots[r.slot];
    let g = list.find((x) => x.source.key === src.key);
    if (!g) {
      g = { source: src, rowIds: [], facts: [], notes: [] };
      list.push(g);
    }
    g.rowIds.push(r.id);
    g.facts.push(...factsOf(r));
    const memo = splitNote(r.note).memo;
    if (memo && !g.notes.includes(memo)) g.notes.push(memo);
    if (!g.source.tag && r.tag) g.source.tag = r.tag;
  }

  const factCount = SLOTS.reduce((n, s) => n + slots[s].reduce((m, g) => m + g.facts.length, 0), 0);
  const filledSlots = SLOTS.filter((s) => slots[s].length > 0).length;
  return { questionId, slots, factCount, filledSlots, extColumns: ext };
}

// ── 태그 ────────────────────────────────────────────────────────────────────

export const TAG_FORMAT = /^[A-Z]{1,2}[0-9]{0,2}$/;

/** 같은 원천이 이미 태그를 가졌으면 그것을, 아니면 칸 머리글자 + 다음 번호. */
export function pickTag(rows: { tag: string | null; key: string }[], key: string, slot: Slot): string {
  const own = rows.find((r) => r.key === key && r.tag)?.tag;
  if (own) return own;
  const letter = SLOT_LETTER[slot];
  const used = rows
    .map((r) => r.tag ?? "")
    .filter((t) => t.startsWith(letter))
    .map((t) => Number(t.slice(letter.length)) || 0);
  return `${letter}${Math.max(0, ...used) + 1}`;
}

function rowKeys(rows: Row[]) {
  return rows.map((r) => ({ tag: r.tag, key: sourceOf(r).key }));
}

// ── 원문 대조 ───────────────────────────────────────────────────────────────

export type Verify =
  | { ok: true; text: string; part: SourcePart; paper?: EpmcPaper }
  | { ok: false; reason: string };

async function pageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (gonnim-dominance; fact check)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return cleanMarkup(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  } catch {
    return null;
  }
}

/**
 * 문장을 원천과 글자 그대로 대조한다. 논문은 초록을 먼저 보고, 없으면 본문(D43)을 본다.
 * bodyUsed = 이 질문에서 이 원천의 본문 문장이 이미 몇 개인가.
 */
export async function verifySentence(
  src: Pick<SourceRef, "kind" | "externalId" | "url" | "license" | "linkOnly">,
  text: string,
  bodyUsed: number,
  cached?: { paper?: EpmcPaper | null; xml?: string | null },
): Promise<Verify> {
  const t = text.trim();
  if (!t) return { ok: false, reason: "문장이 비었습니다" };
  if (t.includes("\n")) return { ok: false, reason: "한 번에 한 문장만 넣습니다" };
  if (src.linkOnly) return { ok: false, reason: "링크만 있는 원천에는 문장을 넣지 않습니다(link_only)" };

  if (src.kind === "paper") {
    const p = cached?.paper ?? (src.externalId ? await paperById(src.externalId) : null);
    if (!p) return { ok: false, reason: "Europe PMC 에서 이 논문을 찾지 못했습니다" };
    const inAbstract = findVerbatim(p.abstract, t);
    if (inAbstract) return { ok: true, text: inAbstract, part: "abstract", paper: p };

    // D43 · 초록에 없으면 본문. 공개 라이선스 논문이고 원천당 2문장까지.
    if (!["cc_by", "cc0", "public_domain"].includes(p.license ?? "")) {
      return { ok: false, reason: "초록에 없습니다. 본문 예외(D43)는 CC BY · CC0 · 퍼블릭 도메인 논문만 됩니다" };
    }
    if (!p.pmcid) return { ok: false, reason: "초록에 없습니다. 이 논문은 Europe PMC 전문이 없어 본문과 대조할 수 없습니다" };
    const xml = cached?.xml ?? (await fullTextXml(p.pmcid));
    if (!xml) return { ok: false, reason: "초록에 글자 그대로 있지 않습니다. 이 논문은 Europe PMC 에서 전문을 받지 못해 본문과는 대조하지 못했습니다" };
    const inBody = findVerbatim(bodyText(xml), t);
    if (!inBody) return { ok: false, reason: "초록과 본문 어디에도 글자 그대로 있지 않습니다" };
    if (bodyUsed >= BODY_LIMIT) {
      return { ok: false, reason: `본문 문장은 원천당 ${BODY_LIMIT}개까지입니다(D43). 이미 ${bodyUsed}개가 있습니다` };
    }
    return { ok: true, text: inBody, part: "body", paper: p };
  }

  // 보도자료 · 외부 공개 원천은 그 페이지와 대조한다. 페이지는 저장하지 않는다.
  const page = src.url ? await pageText(src.url) : null;
  if (!page) return { ok: false, reason: "원천 페이지를 읽지 못해 대조할 수 없습니다" };
  const hit = findVerbatim(page, t);
  return hit ? { ok: true, text: hit, part: "body" } : { ok: false, reason: "원천 페이지에 글자 그대로 있지 않습니다" };
}

// ── 쓰기 ────────────────────────────────────────────────────────────────────

export type NewFact = {
  text: string;
  subject: string | null;
  year: number | null;
  hasNumber: boolean | null;
  verifiedAt: string;
  sourcePart: SourcePart;
};

type SourceFields = {
  paper_id?: string | null;
  gov_press_id?: string | null;
  ext_url?: string | null;
  ext_title?: string | null;
  ext_source_kind?: string | null;
  license?: string | null;
};

function fieldsOf(src: SourceRef): SourceFields {
  if (src.kind === "paper") return { paper_id: src.paperId, license: src.license };
  if (src.kind === "press") return { gov_press_id: src.pressId };
  return { ext_url: src.extUrl, ext_title: src.title, ext_source_kind: src.extKind, license: src.license };
}

const toMeta = (f: NewFact): FactMeta => ({
  subject: f.subject,
  year: f.year,
  has_number: f.hasNumber,
  verified_at: f.verifiedAt,
  source_part: f.sourcePart,
});

/**
 * 대조를 마친 문장을 저장한다. 같은 칸 · 같은 원천 · 같은 문장이 있으면 넣지 않는다.
 * 돌려주는 값: "saved" · "duplicate"
 */
export async function storeFact(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  src: SourceRef,
  fact: NewFact,
  addedBy: "search" | "owner" | "validation" | "daily",
): Promise<"saved" | "duplicate"> {
  const ext = await hasEvidenceColumns(db);
  const all = await loadRows(db, questionId, ext);
  const same = all.filter((r) => r.slot === slot && sourceOf(r).key === src.key);
  if (same.some((r) => lines(r.fact_sentence).includes(fact.text))) return "duplicate";
  const tag = pickTag(rowKeys(all), src.key, slot);

  if (ext) {
    const bare = same.find((r) => !r.fact_sentence);
    const cols = {
      fact_sentence: fact.text,
      fact_subject: fact.subject,
      fact_year: fact.year,
      has_number: fact.hasNumber,
      verified_at: fact.verifiedAt,
      source_part: fact.sourcePart,
    };
    const { error } = bare
      ? await db.from("ds_question_evidence").update(cols).eq("id", bare.id)
      : await db
          .from("ds_question_evidence")
          .insert({ question_id: questionId, slot, tag, added_by: addedBy, ...fieldsOf(src), ...cols });
    if (error) throw new Error(`문장을 저장하지 못했습니다: ${error.message}`);
    return "saved";
  }

  // SQL 전: 같은 칸 · 같은 원천의 첫 행에 줄로 잇는다.
  const row = same[0];
  if (row) {
    const ls = lines(row.fact_sentence);
    const { memo, facts } = splitNote(row.note);
    const metas = ls.map((_, i) => facts[i] ?? {});
    const { error } = await db
      .from("ds_question_evidence")
      .update({ fact_sentence: [...ls, fact.text].join("\n"), note: joinNote(memo, [...metas, toMeta(fact)]) })
      .eq("id", row.id);
    if (error) throw new Error(`문장을 저장하지 못했습니다: ${error.message}`);
    return "saved";
  }
  const { error } = await db.from("ds_question_evidence").insert({
    question_id: questionId,
    slot,
    tag,
    added_by: addedBy,
    ...fieldsOf(src),
    fact_sentence: fact.text,
    note: joinNote(null, [toMeta(fact)]),
  });
  if (error) throw new Error(`문장을 저장하지 못했습니다: ${error.message}`);
  return "saved";
}

async function oneRow(db: SupabaseClient, rowId: string): Promise<Row> {
  const ext = await hasEvidenceColumns(db);
  const { data, error } = await db
    .from("ds_question_evidence")
    .select(ext ? `${BASE}, ${EXT}` : BASE)
    .eq("id", rowId)
    .single();
  if (error || !data) throw new Error("증거 행을 찾지 못했습니다");
  return data as unknown as Row;
}

/** 문장 하나를 뺀다. 원천의 마지막 문장이면 원천 자리는 남긴다(문장 없는 행). */
export async function deleteFact(db: SupabaseClient, rowId: string, line: number): Promise<Fact | null> {
  const r = await oneRow(db, rowId);
  const ls = lines(r.fact_sentence);
  const facts = factsOf(r);
  const removed = facts[line] ?? null;
  if (!removed) throw new Error("그 문장을 찾지 못했습니다");

  if (ls.length > 1) {
    const { memo, facts: meta } = splitNote(r.note);
    const metas = ls.map((_, i) => meta[i] ?? {});
    ls.splice(line, 1);
    metas.splice(line, 1);
    const { error } = await db
      .from("ds_question_evidence")
      .update({ fact_sentence: ls.join("\n"), note: joinNote(memo, metas) })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    return removed;
  }

  const { data: siblings } = await db
    .from("ds_question_evidence")
    .select("id, paper_id, gov_press_id, ext_url")
    .eq("question_id", r.question_id)
    .eq("slot", r.slot)
    .neq("id", rowId);
  const key = sourceOf(r).key;
  const hasSibling = ((siblings ?? []) as Row[]).some((s) => sourceOf({ ...r, ...s } as Row).key === key);
  if (hasSibling) {
    const { error } = await db.from("ds_question_evidence").delete().eq("id", rowId);
    if (error) throw new Error(error.message);
  } else {
    const ext = await hasEvidenceColumns(db);
    const patch: Record<string, unknown> = { fact_sentence: null, note: splitNote(r.note).memo };
    if (ext) Object.assign(patch, { fact_subject: null, fact_year: null, has_number: null, verified_at: null, source_part: null });
    const { error } = await db.from("ds_question_evidence").update(patch).eq("id", rowId);
    if (error) throw new Error(error.message);
  }
  return removed;
}

/** 문장을 다른 칸으로 옮긴다. 대조는 이미 했으므로 다시 하지 않는다. */
export async function moveFact(db: SupabaseClient, rowId: string, line: number, to: Slot): Promise<void> {
  const r = await oneRow(db, rowId);
  if (r.slot === to) return;
  const f = factsOf(r)[line];
  if (!f) throw new Error("그 문장을 찾지 못했습니다");
  const res = await storeFact(
    db,
    r.question_id,
    to,
    sourceOf(r),
    {
      text: f.text,
      subject: f.subject,
      year: f.year,
      hasNumber: f.hasNumber,
      verifiedAt: f.verifiedAt ?? new Date().toISOString(),
      sourcePart: f.sourcePart ?? "abstract",
    },
    (["search", "owner", "validation", "daily"].includes(r.added_by) ? r.added_by : "owner") as "owner",
  );
  if (res === "duplicate") throw new Error(`${SLOT_LABEL[to]} 칸에 같은 문장이 이미 있습니다`);
  await deleteFact(db, rowId, line);
}

/** 대상 · 연도 · 수치 유무를 고친다. */
export async function updateFactMeta(
  db: SupabaseClient,
  rowId: string,
  line: number,
  patch: { subject?: string | null; year?: number | null; hasNumber?: boolean | null },
): Promise<void> {
  const r = await oneRow(db, rowId);
  const ls = lines(r.fact_sentence);
  if (!ls[line]) throw new Error("그 문장을 찾지 못했습니다");
  const ext = await hasEvidenceColumns(db);
  const cur = factsOf(r)[line];
  const next: FactMeta = {
    subject: patch.subject !== undefined ? patch.subject : cur.subject,
    year: patch.year !== undefined ? patch.year : cur.year,
    has_number: patch.hasNumber !== undefined ? patch.hasNumber : cur.hasNumber,
    verified_at: cur.verifiedAt,
    source_part: cur.sourcePart,
  };
  if (ext && ls.length === 1) {
    const { error } = await db
      .from("ds_question_evidence")
      .update({ fact_subject: next.subject, fact_year: next.year, has_number: next.has_number })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    return;
  }
  const { memo, facts } = splitNote(r.note);
  const metas = ls.map((_, i) => facts[i] ?? {});
  metas[line] = next;
  const { error } = await db.from("ds_question_evidence").update({ note: joinNote(memo, metas) }).eq("id", rowId);
  if (error) throw new Error(error.message);
}

/** 원천의 태그를 바꾼다. 이 질문 안의 그 원천 행 모두를 바꾼다. */
export async function setSourceTag(
  db: SupabaseClient,
  questionId: string,
  sourceKey: string,
  tag: string,
): Promise<void> {
  const t = tag.trim().toUpperCase();
  if (!TAG_FORMAT.test(t)) throw new Error("태그 형식은 영문 대문자 1~2자 + 숫자 0~2자입니다(예: E1)");
  const rows = await loadRows(db, questionId, false);
  const mine = rows.filter((r) => sourceOf(r).key === sourceKey);
  if (mine.length === 0) throw new Error("원천을 찾지 못했습니다");
  if (rows.some((r) => sourceOf(r).key !== sourceKey && r.tag === t)) {
    throw new Error(`태그 ${t} 는 다른 원천이 쓰고 있습니다`);
  }
  const { error } = await db
    .from("ds_question_evidence")
    .update({ tag: t })
    .in(
      "id",
      mine.map((r) => r.id),
    );
  if (error) throw new Error(error.message);
}

/** 원천 하나를 칸에서 뺀다(문장 포함). */
export async function removeSource(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  sourceKey: string,
): Promise<number> {
  const rows = await loadRows(db, questionId, false);
  const ids = rows.filter((r) => r.slot === slot && sourceOf(r).key === sourceKey).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error } = await db.from("ds_question_evidence").delete().in("id", ids);
  if (error) throw new Error(error.message);
  return ids.length;
}

// ── 원천 더하기 ─────────────────────────────────────────────────────────────

/** Europe PMC 논문을 ds_papers 에 넣는다(이미 있으면 그 행). 허용 라이선스 밖이면 넣지 않는다(넘지 않는 선 3). */
export async function ensurePaper(db: SupabaseClient, p: EpmcPaper, loadedBy: string): Promise<string> {
  if (!p.license) throw new Error(`라이선스가 허용 목록 밖입니다(${p.licenseRaw ?? "없음"})`);
  const version = p.source === "PPR" ? "preprint" : "published";
  const { data: found } = await db
    .from("ds_papers")
    .select("id")
    .eq("source", "europepmc")
    .eq("external_id", p.externalId)
    .eq("version", version)
    .maybeSingle();
  if (found) return (found as { id: string }).id;
  const { data, error } = await db
    .from("ds_papers")
    .insert({
      source: "europepmc",
      external_id: p.externalId,
      doi: p.doi,
      title: p.title,
      abstract: p.abstract.replace(/\s+/g, " ").trim() || null,
      authors: p.authors,
      published_date: p.firstPublicationDate,
      license: p.license,
      license_raw: p.licenseRaw ?? "",
      landing_url: `https://europepmc.org/article/${p.source}/${p.id}`,
      version,
      raw_data: { journal: p.journal, pmcid: p.pmcid, loaded_by: loadedBy },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`논문을 넣지 못했습니다: ${error?.message}`);
  return (data as { id: string }).id;
}

export function paperSource(paperId: string, p: EpmcPaper): SourceRef {
  return {
    key: `paper:${paperId}`,
    kind: "paper",
    paperId,
    pressId: null,
    extUrl: null,
    externalId: p.externalId,
    title: p.title,
    url: `https://europepmc.org/article/${p.source}/${p.id}`,
    license: p.license,
    extKind: null,
    tag: null,
    linkOnly: false,
  };
}

/** 원천 자리만 만든다(문장 없음). 이미 있으면 그대로 둔다. */
export async function placeSource(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  src: SourceRef,
  opts: { memo?: string | null; tag?: string | null; addedBy?: "owner" | "search" } = {},
): Promise<{ tag: string; created: boolean }> {
  const rows = await loadRows(db, questionId, false);
  const existing = rows.find((r) => r.slot === slot && sourceOf(r).key === src.key);
  if (existing) return { tag: existing.tag ?? "", created: false };
  let tag = opts.tag?.trim().toUpperCase() || pickTag(rowKeys(rows), src.key, slot);
  if (!TAG_FORMAT.test(tag)) throw new Error("태그 형식은 영문 대문자 1~2자 + 숫자 0~2자입니다(예: I1)");
  if (rows.some((r) => sourceOf(r).key !== src.key && r.tag === tag)) tag = pickTag(rowKeys(rows), src.key, slot);
  const { error } = await db.from("ds_question_evidence").insert({
    question_id: questionId,
    slot,
    tag,
    added_by: opts.addedBy ?? "owner",
    ...fieldsOf(src),
    note: opts.memo?.trim() || null,
  });
  if (error) throw new Error(`원천을 넣지 못했습니다: ${error.message}`);
  return { tag, created: true };
}

export async function addPaperByRef(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  ref: string,
): Promise<{ tag: string; title: string }> {
  const p = await paperById(ref);
  if (!p) throw new Error("Europe PMC 에서 찾지 못했습니다");
  const id = await ensurePaper(db, p, "evidence-owner");
  const { tag } = await placeSource(db, questionId, slot, paperSource(id, p));
  return { tag, title: p.title };
}

export type ExternalInput = {
  url: string;
  title: string;
  kind: string;
  license: string;
  memo: string | null;
  tag: string | null;
};

export async function addExternalSource(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  x: ExternalInput,
): Promise<{ tag: string }> {
  let url: URL;
  try {
    url = new URL(x.url.trim());
  } catch {
    throw new Error("주소 형식이 아닙니다");
  }
  if (!x.title.trim()) throw new Error("제목을 적어 주십시오");
  if (!(EXT_KINDS as readonly string[]).includes(x.kind)) throw new Error("종류를 골라 주십시오");
  if (!(EXT_LICENSES as readonly string[]).includes(x.license)) throw new Error("라이선스를 골라 주십시오");
  const src: SourceRef = {
    key: `ext:${url.toString()}`,
    kind: "ext",
    paperId: null,
    pressId: null,
    extUrl: url.toString(),
    externalId: null,
    title: x.title.trim(),
    url: url.toString(),
    license: x.license,
    extKind: x.kind,
    tag: null,
    linkOnly: x.license === "link_only",
  };
  const { tag } = await placeSource(db, questionId, slot, src, { memo: x.memo, tag: x.tag });
  return { tag };
}

/** 이 질문에서 이 원천의 본문(body) 문장 수 · D43 상한 확인용 */
export function bodyCount(table: EvidenceTable, sourceKey: string): number {
  return SLOTS.flatMap((s) => table.slots[s])
    .filter((g) => g.source.key === sourceKey)
    .flatMap((g) => g.facts)
    .filter((f) => f.sourcePart === "body").length;
}

/** 운영자가 문장을 더한다: 대조 → 저장. 못 찾으면 저장하지 않고 이유를 돌려준다. */
export async function addOwnerFact(
  db: SupabaseClient,
  questionId: string,
  slot: Slot,
  sourceKey: string,
  input: { text: string; subject: string | null; year: number | null; hasNumber: boolean | null },
): Promise<{ ok: true; text: string; part: SourcePart } | { ok: false; reason: string }> {
  const table = await loadEvidence(db, questionId);
  const g = SLOTS.flatMap((s) => table.slots[s]).find((x) => x.source.key === sourceKey);
  if (!g) return { ok: false, reason: "원천을 먼저 이 질문에 넣어 주십시오" };
  const v = await verifySentence(g.source, input.text, bodyCount(table, sourceKey));
  if (!v.ok) return v;
  const res = await storeFact(
    db,
    questionId,
    slot,
    g.source,
    {
      text: v.text,
      subject: input.subject,
      year: input.year ?? (v.paper?.year ? Number(v.paper.year) : null),
      hasNumber: input.hasNumber ?? /\d/.test(v.text),
      verifiedAt: new Date().toISOString(),
      sourcePart: v.part,
    },
    "owner",
  );
  if (res === "duplicate") return { ok: false, reason: "같은 칸에 같은 문장이 이미 있습니다" };
  return { ok: true, text: v.text, part: v.part };
}

// ── SQL 뒤 정리: 묶인 행 펼치기 · 다시 대조 (20차 보충 1) ─────────────────────

export type SplitReport = {
  rowsBefore: number;
  rowsAfter: number;
  split: number;
  verified: number;
  failed: { tag: string | null; text: string; reason: string }[];
  changedGlyphs: number;
  skipped: number;
};

/**
 * SQL 전에 (칸, 원천) 한 행에 줄로 묶어 둔 문장을 한 행에 하나씩 펼친다. 메타 줄 속성은 새 칸으로 옮긴다.
 * reverify 이면 문장마다 원문과 다시 대조해 verified_at · source_part 를 채운다(원문 글자가 다르면 원문 글자로).
 * 대조에 실패한 문장은 지우지 않고 verified_at 을 비워 둔다. 두 번 돌려도 같다(멱등).
 */
export async function splitAndVerify(
  db: SupabaseClient,
  questionId: string,
  reverify: boolean,
): Promise<SplitReport> {
  if (!(await hasEvidenceColumns(db))) throw new Error("4단계 SQL 전에는 펼칠 수 없습니다");
  const rows = await loadRows(db, questionId, true);
  const rep: SplitReport = { rowsBefore: rows.length, rowsAfter: 0, split: 0, verified: 0, failed: [], changedGlyphs: 0, skipped: 0 };

  // 1) 펼치기
  for (const r of rows) {
    const ls = lines(r.fact_sentence);
    if (ls.length <= 1 && !(ls.length === 1 && splitNote(r.note).facts.length > 0)) continue;
    const { memo, facts } = splitNote(r.note);
    const m0 = facts[0] ?? {};
    const colsOf = (m: FactMeta) => ({
      fact_subject: m.subject ?? null,
      fact_year: m.year ?? null,
      has_number: m.has_number ?? null,
      verified_at: m.verified_at ?? null,
      source_part: m.source_part ?? null,
    });
    const { error: e0 } = await db
      .from("ds_question_evidence")
      .update({ fact_sentence: ls[0], note: memo, ...colsOf(m0) })
      .eq("id", r.id);
    if (e0) throw new Error(e0.message);
    for (let i = 1; i < ls.length; i++) {
      const { error } = await db.from("ds_question_evidence").insert({
        question_id: r.question_id,
        slot: r.slot,
        tag: r.tag,
        added_by: r.added_by,
        paper_id: r.paper_id,
        gov_press_id: r.gov_press_id,
        ext_url: r.ext_url,
        ext_title: r.ext_title,
        ext_source_kind: r.ext_source_kind,
        license: r.license,
        note: memo,
        fact_sentence: ls[i],
        ...colsOf(facts[i] ?? {}),
      });
      // 23505 = 이미 펼쳐 둔 문장(두 번째 실행)
      if (error && error.code !== "23505") throw new Error(error.message);
    }
    rep.split++;
  }

  // 2) 다시 대조
  const after = await loadRows(db, questionId, true);
  rep.rowsAfter = after.length;
  if (!reverify) return rep;

  const paperCache = new Map<string, { paper: EpmcPaper | null; xml?: string | null }>();
  const bodyUsed = new Map<string, number>();
  for (const r of after) {
    const text = r.fact_sentence?.trim();
    if (!text) continue;
    const src = sourceOf(r);
    if (src.linkOnly) {
      rep.skipped++;
      continue;
    }
    let cached = paperCache.get(src.key);
    if (!cached && src.kind === "paper" && src.externalId) {
      cached = { paper: await paperById(src.externalId) };
      paperCache.set(src.key, cached);
    }
    if (cached?.paper?.pmcid && cached.xml === undefined && !findVerbatim(cached.paper.abstract, text)) {
      cached.xml = await fullTextXml(cached.paper.pmcid);
    }
    const v = await verifySentence(src, text, bodyUsed.get(src.key) ?? 0, cached ? { paper: cached.paper, xml: cached.xml } : undefined);
    if (!v.ok) {
      rep.failed.push({ tag: r.tag, text, reason: v.reason });
      continue;
    }
    if (v.part === "body") bodyUsed.set(src.key, (bodyUsed.get(src.key) ?? 0) + 1);
    const patch: Record<string, unknown> = { verified_at: new Date().toISOString(), source_part: v.part };
    if (v.text !== text) {
      patch.fact_sentence = v.text;
      rep.changedGlyphs++;
    }
    if (r.fact_year === null && v.paper?.year) patch.fact_year = Number(v.paper.year);
    if (r.has_number === null) patch.has_number = /\d/.test(v.text);
    const { error } = await db.from("ds_question_evidence").update(patch).eq("id", r.id);
    if (error) throw new Error(error.message);
    rep.verified++;
  }
  return rep;
}
