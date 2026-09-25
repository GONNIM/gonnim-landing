// 수집 한 번. 크론이 부르고, 스크립트도 같은 함수를 부른다.
//
// 원천마다 실패해도 전체를 멈추지 않는다. 한 곳이 죽어도 나머지는 들어와야 한다.
// 중복은 DB 의 UNIQUE 제약이 막는다 — 코드로 다시 확인하지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { collectArxiv } from "./arxiv";
import { collectEuropePmc } from "./europepmc";
import { collectGovPress } from "./gov-press";
import { collectMedrxiv } from "./medrxiv";
import type { CollectReport, RawGovPress, RawPaper } from "./types";

export type CollectSummary = {
  reports: CollectReport[];
  insertedPapers: number;
  insertedPress: number;
};

async function upsertPapers(
  db: SupabaseClient,
  papers: RawPaper[],
): Promise<{ inserted: number; error: string | null }> {
  if (papers.length === 0) return { inserted: 0, error: null };

  const { data, error } = await db
    .from("ds_papers")
    .upsert(papers, {
      onConflict: "source,external_id,version",
      ignoreDuplicates: true,
    })
    .select("id");

  return { inserted: data?.length ?? 0, error: error?.message ?? null };
}

async function upsertPress(
  db: SupabaseClient,
  press: RawGovPress[],
): Promise<{ inserted: number; error: string | null }> {
  if (press.length === 0) return { inserted: 0, error: null };

  const { data, error } = await db
    .from("ds_gov_press")
    .upsert(press, {
      onConflict: "agency,external_id",
      ignoreDuplicates: true,
    })
    .select("id");

  return { inserted: data?.length ?? 0, error: error?.message ?? null };
}

export async function collectAll(db: SupabaseClient): Promise<CollectSummary> {
  // arXiv 는 3초 간격 직렬 큐를 타므로 가장 오래 걸린다. 다른 원천과 함께 돌린다.
  const [arxiv, medrxiv, epmc, gov] = await Promise.all([
    collectArxiv(),
    collectMedrxiv(),
    collectEuropePmc(),
    collectGovPress(),
  ]);

  const papers = [...arxiv.papers, ...medrxiv.papers, ...epmc.papers];
  const reports = [
    arxiv.report,
    medrxiv.report,
    epmc.report,
    gov.report,
  ];

  const paperResult = await upsertPapers(db, papers);
  if (paperResult.error) {
    reports.push({
      source: "ds_papers 저장",
      found: papers.length,
      rejected: 0,
      errors: [paperResult.error],
    });
  }

  const pressResult = await upsertPress(db, gov.press);
  if (pressResult.error) {
    reports.push({
      source: "ds_gov_press 저장",
      found: gov.press.length,
      rejected: 0,
      errors: [pressResult.error],
    });
  }

  return {
    reports,
    insertedPapers: paperResult.inserted,
    insertedPress: pressResult.inserted,
  };
}

export { collectArxiv, collectEuropePmc, collectGovPress, collectMedrxiv };
export type { CollectReport, RawGovPress, RawPaper } from "./types";
