// 초안의 곁가지 파일 · 제목 후보 3개 · 용어표 · 이전 판.
//
// ds_letters 에는 이 값들을 둘 칸이 없다. 새 칸을 만들려면 SQL 이 한 번 더 필요하므로,
// Storage 의 **비공개** 버킷 ds-drafts 에 파일로 둔다. (ds-letters 버킷은 공개라 쓰지 않는다.)
//   ds-drafts/<letterId>/meta.json            제목 후보 · 용어표 · 생성 기록
//   ds-drafts/<letterId>/archive/<시각>.json   [글 작성하기]를 다시 눌러 밀려난 이전 판

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlossaryItem } from "./draft-card";
import type { LetterBlock } from "./types";

export const DRAFT_BUCKET = "ds-drafts";

export type DraftMeta = {
  titles: string[];
  glossary: GlossaryItem[];
  /** [V] 검색어의 뜻 (4판 조건 30) */
  vMeaning?: string | null;
  /** 지시문 판 번호 */
  promptVersion?: number;
  generatedAt: string;
  llmCalls: number;
  ms: { pick?: number; glossary: number; draft: number };
  pickLog?: import("./draft-card").PickLog[];
  unverified?: number;
  tokens: { input: number; output: number };
  cardFacts: number;
  model: string;
  /** 이 판이 몇 번째 생성인지(1부터) */
  generation: number;
  /** 48차 A · D51 · 제목 · 한 문장 요약 추천(Claude) 마지막 결과 */
  title_suggestions?: import("./title-suggest").TitleSuggestions;
};

async function ensureBucket(db: SupabaseClient) {
  const { data } = await db.storage.getBucket(DRAFT_BUCKET);
  if (data) {
    if (data.public) throw new Error(`${DRAFT_BUCKET} 버킷이 공개로 되어 있습니다. 초안을 쓰지 않습니다`);
    return;
  }
  const { error } = await db.storage.createBucket(DRAFT_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(`초안 보관 버킷을 만들지 못했습니다: ${error.message}`);
}

async function putJson(db: SupabaseClient, path: string, value: unknown) {
  await ensureBucket(db);
  const { error } = await db.storage
    .from(DRAFT_BUCKET)
    .upload(path, new Blob([JSON.stringify(value, null, 1)], { type: "application/json" }), { upsert: true });
  if (error) throw new Error(`초안 파일을 쓰지 못했습니다(${path}): ${error.message}`);
}

export async function readDraftMeta(db: SupabaseClient, letterId: string): Promise<DraftMeta | null> {
  const { data } = await db.storage.from(DRAFT_BUCKET).download(`${letterId}/meta.json`);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as DraftMeta;
  } catch {
    return null;
  }
}

export async function writeDraftMeta(db: SupabaseClient, letterId: string, meta: DraftMeta) {
  await putJson(db, `${letterId}/meta.json`, meta);
}

export async function archiveDraft(
  db: SupabaseClient,
  letterId: string,
  snapshot: { title: string; summary: string | null; blocks: LetterBlock[]; meta: DraftMeta | null },
): Promise<string> {
  const path = `${letterId}/archive/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await putJson(db, path, { archivedAt: new Date().toISOString(), ...snapshot });
  return path;
}

export async function listArchives(db: SupabaseClient, letterId: string): Promise<string[]> {
  const { data } = await db.storage.from(DRAFT_BUCKET).list(`${letterId}/archive`);
  return (data ?? []).map((f) => f.name);
}

/**
 * 다음 질문 투표 후보(26차 C-3). 운영자가 일정 달력에서 validated 질문 3개를 고른다.
 * 스키마를 바꾸지 않으려고 글 행이 아니라 비공개 버킷의 <글 id>/votes.json 에 둔다.
 * 발행할 때 질문 문장까지 공개 JSON 에 옮긴다.
 */
export type VoteCandidate = { id: string; question: string };

export async function readVoteCandidates(db: SupabaseClient, letterId: string): Promise<VoteCandidate[]> {
  const { data } = await db.storage.from(DRAFT_BUCKET).download(`${letterId}/votes.json`);
  if (!data) return [];
  try {
    const v = JSON.parse(await data.text()) as { candidates?: VoteCandidate[] };
    return (v.candidates ?? []).slice(0, 3);
  } catch {
    return [];
  }
}

export async function writeVoteCandidates(db: SupabaseClient, letterId: string, candidates: VoteCandidate[]) {
  await putJson(db, `${letterId}/votes.json`, { candidates: candidates.slice(0, 3), at: new Date().toISOString() });
}
