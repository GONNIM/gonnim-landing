// 레터 행을 만들고 고치는 공통 동작. 서버 액션과 크론이 같은 경로를 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLetterDraft, type DraftSource } from "./draft";
import { kstToday } from "./kst";
import {
  AGENCY_LABEL,
  LICENSE_LABEL,
  SOURCE_LABEL,
  type LetterBlock,
  type ScoreBreakdown,
} from "./types";

/** 한국어 제목은 주소에 넣기 어렵다. 날짜와 짧은 난수로 만든다. */
export function makeSlug(date: string = kstToday()): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${date}-${suffix}`;
}

type CandidateWithSource = {
  id: string;
  headline: string;
  hook: string | null;
  score_breakdown: ScoreBreakdown | null;
  paper: {
    id: string;
    title: string;
    abstract: string | null;
    landing_url: string;
    published_date: string | null;
  } | null;
  gov_press: {
    id: string;
    title: string;
    body: string | null;
    landing_url: string;
    published_date: string | null;
    attribution: string;
  } | null;
};

const CANDIDATE_SELECT = `
  id, headline, hook, score_breakdown,
  paper:ds_papers!ds_candidates_paper_id_fkey (
    id, title, abstract, landing_url, published_date
  ),
  gov_press:ds_gov_press!ds_candidates_gov_press_id_fkey (
    id, title, body, landing_url, published_date, attribution
  )
`;

function toDraftSources(c: CandidateWithSource): DraftSource[] {
  if (c.paper) {
    return [
      {
        sourceId: c.paper.id,
        kind: "paper",
        title: c.paper.title,
        abstract: c.paper.abstract,
        landingUrl: c.paper.landing_url,
        publishedDate: c.paper.published_date,
        attribution: null,
      },
    ];
  }
  if (c.gov_press) {
    return [
      {
        sourceId: c.gov_press.id,
        kind: "gov_press",
        title: c.gov_press.title,
        abstract: c.gov_press.body,
        landingUrl: c.gov_press.landing_url,
        publishedDate: c.gov_press.published_date,
        attribution: c.gov_press.attribution,
      },
    ];
  }
  return [];
}

export type DraftOutcome =
  | { ok: true; letterId: string; title: string }
  | { ok: false; candidateId: string; headline: string; error: string };

/**
 * 후보 하나로 레터 행을 만든다. 실패해도 예외를 던지지 않는다 —
 * 여러 건을 한 번에 돌릴 때 한 건의 실패가 나머지를 막으면 안 된다.
 */
export async function draftLetterFromCandidate(
  db: SupabaseClient,
  candidateId: string,
): Promise<DraftOutcome> {
  const { data, error } = await db
    .from("ds_candidates")
    .select(CANDIDATE_SELECT)
    .eq("id", candidateId)
    .maybeSingle<CandidateWithSource>();

  if (error) return { ok: false, candidateId, headline: "-", error: error.message };
  if (!data) return { ok: false, candidateId, headline: "-", error: "후보를 찾지 못했습니다" };

  const sources = toDraftSources(data);
  if (sources.length === 0) {
    return {
      ok: false,
      candidateId,
      headline: data.headline,
      error: "후보에 연결된 원천이 없습니다",
    };
  }

  let draft;
  try {
    draft = await generateLetterDraft({
      headline: data.headline,
      hook: data.hook,
      paradoxLine: data.score_breakdown?.interest.paradoxLine ?? null,
      sources,
    });
  } catch (err) {
    return {
      ok: false,
      candidateId,
      headline: data.headline,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { data: letter, error: insertErr } = await db
    .from("ds_letters")
    .insert({
      candidate_id: candidateId,
      slug: makeSlug(),
      title: draft.title,
      summary: draft.summary,
      blocks: draft.blocks,
      status: "draft",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !letter) {
    return {
      ok: false,
      candidateId,
      headline: data.headline,
      error: insertErr?.message ?? "레터 저장 실패",
    };
  }

  // 사실 문장이 어느 원천을 가리키는지 표로도 남긴다. 발행 페이지가 이것을 읽는다.
  await db.from("ds_letter_sources").insert(
    sources.map((s) => ({
      letter_id: letter.id,
      paper_id: s.kind === "paper" ? s.sourceId : null,
      gov_press_id: s.kind === "gov_press" ? s.sourceId : null,
    })),
  );

  await db.from("ds_letter_audit").insert({
    letter_id: letter.id,
    event: "draft",
    model: process.env.ZAI_MODEL || "glm-5.2",
    reject_filters: draft.blocks
      .filter((b) => b.flags?.length)
      .map((b) => ({ kind: b.kind, flags: b.flags })),
    passed: draft.blocks.every((b) => !b.flags?.length),
  });

  await db.from("ds_candidates").update({ state: "drafted" }).eq("id", candidateId);

  return { ok: true, letterId: letter.id, title: draft.title };
}

export type LoadedSource = {
  label: string;
  title: string;
  url: string;
  abstract: string | null;
  attribution: string | null;
  licenseLabel: string;
};

const SOURCE_SELECT = `
  paper:ds_papers ( source, title, abstract, landing_url, license ),
  gov_press:ds_gov_press ( agency, title, body, landing_url, attribution )
`;

type SourceRow = {
  paper: {
    source: string;
    title: string;
    abstract: string | null;
    landing_url: string;
    license: string;
  } | null;
  gov_press: {
    agency: string;
    title: string;
    body: string | null;
    landing_url: string;
    attribution: string;
  } | null;
};

/** 편집 화면과 리뷰 화면이 같은 원천 목록을 본다. 한 곳에서 만든다. */
export async function loadLetterSources(
  db: SupabaseClient,
  letterId: string,
): Promise<LoadedSource[]> {
  const { data } = await db
    .from("ds_letter_sources")
    .select(SOURCE_SELECT)
    .eq("letter_id", letterId);

  const rows = (data ?? []) as unknown as SourceRow[];

  return rows.flatMap((r): LoadedSource[] => {
    if (r.paper) {
      return [
        {
          label: SOURCE_LABEL[r.paper.source] ?? r.paper.source,
          title: r.paper.title,
          url: r.paper.landing_url,
          abstract: r.paper.abstract,
          attribution: null,
          licenseLabel: LICENSE_LABEL[r.paper.license] ?? r.paper.license,
        },
      ];
    }
    if (r.gov_press) {
      return [
        {
          label: AGENCY_LABEL[r.gov_press.agency] ?? r.gov_press.agency,
          title: r.gov_press.title,
          url: r.gov_press.landing_url,
          abstract: r.gov_press.body,
          attribution: r.gov_press.attribution,
          licenseLabel: "공공누리 제1유형",
        },
      ];
    }
    return [];
  });
}

/** 편집기가 저장할 때 쓴다. updated_at 을 항상 같이 올린다. */
export async function saveLetterBody(
  db: SupabaseClient,
  letterId: string,
  patch: { title?: string; summary?: string; blocks?: LetterBlock[] },
) {
  return db
    .from("ds_letters")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", letterId);
}
