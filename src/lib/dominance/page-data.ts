// 56차 D · 화면 여섯 곳의 자료 읽기 · 화면(page.tsx)과 시간 재기 라우트(/api/cron/dominance-timing)가 같은 함수를 부른다.
// 함수마다 Timer 로 단계 시간을 남긴다. 화면 그리기(React) 시간은 들어 있지 않다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLatestNeeds, type NeedsWeek } from "./needs";
import { loadNextActions, type NextAction } from "./next-actions";
import { loadQuestions } from "./questions";
import { loadQuestion, type Question } from "./questions";
import { loadEvidence, SLOTS, type EvidenceTable } from "./evidence";
import { prevSentence } from "./prev-sentence";
import { loadCardSentences, loadQuestionCard, meaningStatus, numberMismatchesFor, unverifiedInLetter, usedFacts, type MeaningStatus } from "./card";
import { fillUsedMeanings } from "./meaning-fill";
import { loadLetterSources } from "./letters";
import { readDraftMeta } from "./draft-store";
import { linkCheckUrls, runReviewChecks } from "./review";
import type { LetterBlock, LetterStatus, ReviewChecks } from "./types";
import { noTimer, type Timer } from "./timing";

// ── 현황 ──────────────────────────────────────────────────────────────────
export type OverviewLetter = { id: string; title: string; status: LetterStatus; scheduled_for: string | null; updated_at: string };
export async function loadOverview(db: SupabaseClient, t: Timer = noTimer) {
  const { error: candErr } = await t.step("스키마 확인", db.from("ds_candidates").select("id").limit(1));
  const letters = await t.step("글 목록", db.from("ds_letters").select("id, title, status, scheduled_for, updated_at").order("updated_at", { ascending: false }));
  const lastRun = await t.step("마지막 크론", db.from("ds_cron_runs").select("started_at, summary").order("started_at", { ascending: false }).limit(1).maybeSingle());
  const questionRows = await t.step("질문 상태", db.from("ds_questions").select("status"));
  const needs = await t.step("Needs", loadLatestNeeds(db).catch(() => null as NeedsWeek | null));
  const nextActions = await t.step("다음 할 일", loadNextActions(db).catch(() => [] as NextAction[]));
  return {
    candErr,
    letters: (letters.data ?? []) as OverviewLetter[],
    lastRun: lastRun.data as { started_at: string; summary: string | null } | null,
    questionRows: (questionRows.data ?? []) as { status: string }[],
    needs,
    nextActions,
  };
}

// ── ① 이슈 ────────────────────────────────────────────────────────────────
export async function loadQuestionsPage(db: SupabaseClient, t: Timer = noTimer) {
  return t.step("질문 목록", loadQuestions(db));
}

// ── ② 증거 표 ─────────────────────────────────────────────────────────────
export async function loadEvidencePage(db: SupabaseClient, id: string, t: Timer = noTimer): Promise<{
  q: Question | null;
  table: EvidenceTable | null;
  letter: { id: string; status: string } | null;
  usedIds: string[];
  prevById: Record<string, string>;
}> {
  const q = await t.step("질문", loadQuestion(db, id));
  if (!q) return { q: null, table: null, letter: null, usedIds: [], prevById: {} };
  // 53차 G · D54 · 글이 있고 쓰인 문장의 뜻이 비었으면 처음 열 때 한 번 채운다(미확인 · 실패해도 화면은 연다)
  await t.step("뜻 초안 자동 채움 확인", fillUsedMeanings(db, id, { auto: true }).catch(() => null));
  const table = await t.step("증거 표", loadEvidence(db, id));
  const { data: letter } = await t.step(
    "글 찾기",
    db.from("ds_letters").select("id, status").eq("question_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; status: string }>(),
  );
  // 25차 C · 글에 쓰인 문장만 뜻을 확인하면 된다. 그 문장들을 맨 위로 올린다.
  let usedIds: string[] = [];
  if (letter) {
    const { data: lb } = await t.step("글 본문", db.from("ds_letters").select("blocks").eq("id", letter.id).single<{ blocks: { text: string }[] }>());
    const card = await t.step("사실 카드", loadQuestionCard(db, id));
    if (card && lb) usedIds = usedFacts(card, lb.blocks).map((f) => f.id);
  }
  // 33차 F · 원문마다 초록의 바로 앞 문장(지시어 확인용 · LLM 없음)
  const groups = SLOTS.flatMap((s) => table.slots[s]);
  const paperIds = [...new Set(groups.map((g) => g.source.paperId).filter((x): x is string => !!x))];
  const { data: papers } = paperIds.length
    ? await t.step("초록(앞 문장)", db.from("ds_papers").select("id, abstract").in("id", paperIds))
    : { data: [] };
  const abstractOf = new Map(((papers ?? []) as { id: string; abstract: string | null }[]).map((p) => [p.id, p.abstract]));
  const prevById: Record<string, string> = {};
  for (const g of groups) {
    if (!g.source.paperId) continue;
    for (const f of g.facts) {
      const p = prevSentence(abstractOf.get(g.source.paperId), f.text);
      if (p) prevById[`${f.rowId}:${f.line}`] = p;
    }
  }
  return { q, table, letter: letter ?? null, usedIds, prevById };
}

// ── ③ 편집 ────────────────────────────────────────────────────────────────
export type EditorRow = {
  id: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  status: LetterStatus;
  revision_count: number;
  question_id: string | null;
};
export async function loadEditorPage(db: SupabaseClient, id: string, t: Timer = noTimer) {
  const { data } = await t.step(
    "글",
    db.from("ds_letters").select("id, title, summary, blocks, status, revision_count, question_id").eq("id", id).maybeSingle<EditorRow>(),
  );
  if (!data) return null;
  const sources = await t.step("원천", loadLetterSources(db, id));
  // 질문에서 나온 글(20차)은 왼쪽에 사실 카드를 둔다. 옛 글은 원천 초록을 둔다.
  const card = data.question_id ? await t.step("사실 카드", loadQuestionCard(db, data.question_id)) : null;
  const meta = data.question_id ? await t.step("메타 파일", readDraftMeta(db, id)) : null;
  const mismatches = await t.step("카드 수치 대조", numberMismatchesFor(db, data.question_id, data.blocks, meta?.glossary ?? []));
  // 24차 B-5 · 확인되지 않은 뜻으로 만든 초안이면 맨 위에 표시. 운영자가 뜻을 확인하면 사라진다.
  const unverified = card ? unverifiedInLetter(card, data.blocks) : 0;
  return { data, sources, card, meta, mismatches, unverified };
}

// ── ④ 리뷰 ────────────────────────────────────────────────────────────────
export type ReviewRow = {
  id: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  status: LetterStatus;
  review_checks: ReviewChecks | null;
  revision_count: number;
  question_id: string | null;
};
export async function loadReviewPage(db: SupabaseClient, id: string, t: Timer = noTimer): Promise<{
  data: ReviewRow;
  sources: Awaited<ReturnType<typeof loadLetterSources>>;
  checks: Awaited<ReturnType<typeof runReviewChecks>>;
  meaning: MeaningStatus;
  draftMeta: Awaited<ReturnType<typeof readDraftMeta>>;
} | null> {
  const { data } = await t.step(
    "글",
    db.from("ds_letters").select("id, title, summary, blocks, status, review_checks, revision_count, question_id").eq("id", id).maybeSingle<ReviewRow>(),
  );
  if (!data) return null;
  const sources = await t.step("원천", loadLetterSources(db, id));
  const cardSentences = await t.step("카드 문장", loadCardSentences(db, data.question_id));
  // 화면을 열 때마다 다시 점검한다. 자동 점검은 돈이 들지 않는다.
  const checks = await t.step(
    "자동 점검(링크 포함)",
    runReviewChecks({ blocks: data.blocks, sourceUrls: linkCheckUrls(sources), sourceTags: sources.map((s) => s.tag), summary: data.summary, cardSentences }),
  );
  // 45차 C · D50 · 쓰인 문장 뜻 확인 수(알림만)
  const meaning = await t.step("뜻 확인 수", meaningStatus(db, id));
  // 48차 A · D51 · 리뷰 대기 · 리뷰 통과 글은 제목 · 요약만 여기서 고칠 수 있다
  const titleEditable = data.status === "review" || data.status === "reviewed";
  const draftMeta = titleEditable ? await t.step("메타 파일", readDraftMeta(db, id)) : null;
  return { data, sources, checks, meaning, draftMeta };
}

// ── ⑤ 발행일 ──────────────────────────────────────────────────────────────
export const SCHEDULE_SELECT = "id, title, status, scheduled_for, reviewed_at, revision_count";
export async function loadSchedulePage(db: SupabaseClient, bounds: { first: string; last: string }, t: Timer = noTimer) {
  const [scheduled, pool] = await t.step(
    "달력 · 대기 글",
    Promise.all([
      db
        .from("ds_letters")
        .select(SCHEDULE_SELECT)
        .gte("scheduled_for", bounds.first)
        .lte("scheduled_for", bounds.last)
        .in("status", ["approved", "published"])
        .order("scheduled_for", { ascending: true }),
      db.from("ds_letters").select(SCHEDULE_SELECT).eq("status", "reviewed").order("reviewed_at", { ascending: true }),
    ]),
  );
  return { scheduled, pool };
}
