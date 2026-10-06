// 56차 D · 화면 여섯 곳의 자료 읽기 · 화면(page.tsx)과 시간 재기 라우트(/api/cron/dominance-timing)가 같은 함수를 부른다.
// 함수마다 Timer 로 단계 시간을 남긴다. 화면 그리기(React) 시간은 들어 있지 않다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLatestNeeds, type NeedsWeek } from "./needs";
import { loadNextActions, type NextAction } from "./next-actions";
import { loadQuestions } from "./questions";
import { loadQuestion, type Question } from "./questions";
import { loadEvidence, SLOTS, type EvidenceTable } from "./evidence";
import { prevSentence } from "./prev-sentence";
import { loadQuestionCard, meaningStatusFrom, numberMismatchesFor, unverifiedInLetter, usedFacts, type MeaningStatus } from "./card";
import { fillUsedMeanings } from "./meaning-fill";
import { loadLetterSources } from "./letters";
import { readDraftMeta } from "./draft-store";
import { checkLinkCached, linkCheckUrls, runReviewChecks } from "./review";
import type { LetterBlock, LetterStatus, ReviewChecks } from "./types";
import { noTimer, type Timer } from "./timing";

// ── 현황 ──────────────────────────────────────────────────────────────────
export type OverviewLetter = { id: string; title: string; status: LetterStatus; scheduled_for: string | null; updated_at: string };
export async function loadOverview(db: SupabaseClient, t: Timer = noTimer) {
  // 56차 D · 서로 기다릴 이유가 없으므로 동시에 읽는다(단계 시간은 겹친다 · 합계는 가장 긴 것)
  const [{ error: candErr }, letters, lastRun, questionRows, needs, nextActions] = await Promise.all([
    t.step("스키마 확인", db.from("ds_candidates").select("id").limit(1)),
    t.step("글 목록", db.from("ds_letters").select("id, title, status, scheduled_for, updated_at").order("updated_at", { ascending: false })),
    t.step("마지막 크론", db.from("ds_cron_runs").select("started_at, summary").order("started_at", { ascending: false }).limit(1).maybeSingle()),
    t.step("질문 상태", db.from("ds_questions").select("status")),
    t.step("Needs", loadLatestNeeds(db).catch(() => null as NeedsWeek | null)),
    t.step("다음 할 일", loadNextActions(db).catch(() => [] as NextAction[])),
  ]);
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
  // 56차 D · 질문 읽기와 뜻 초안 자동 채움 확인을 동시에(채움은 증거 표를 읽기 전에 끝나야 한다)
  const [q] = await Promise.all([
    t.step("질문", loadQuestion(db, id)),
    // 53차 G · D54 · 글이 있고 쓰인 문장의 뜻이 비었으면 처음 열 때 한 번 채운다(미확인 · 실패해도 화면은 연다)
    t.step("뜻 초안 자동 채움 확인", fillUsedMeanings(db, id, { auto: true }).catch(() => null)),
  ]);
  if (!q) return { q: null, table: null, letter: null, usedIds: [], prevById: {} };
  const [table, { data: letter }] = await Promise.all([
    t.step("증거 표", loadEvidence(db, id)),
    t.step(
      "글 찾기(본문 포함)",
      db.from("ds_letters").select("id, status, blocks").eq("question_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; status: string; blocks: { text: string }[] }>(),
    ),
  ]);
  // 33차 F · 원문마다 초록의 바로 앞 문장(지시어 확인용 · LLM 없음)
  const groups = SLOTS.flatMap((s) => table.slots[s]);
  const paperIds = [...new Set(groups.map((g) => g.source.paperId).filter((x): x is string => !!x))];
  // 25차 C · 글에 쓰인 문장만 뜻을 확인하면 된다. 카드는 방금 읽은 증거 표로 만든다(다시 읽지 않음)
  const [card, { data: papers }] = await Promise.all([
    letter ? t.step("사실 카드", loadQuestionCard(db, id, { table, q })) : Promise.resolve(null),
    paperIds.length
      ? t.step("초록(앞 문장)", db.from("ds_papers").select("id, abstract").in("id", paperIds))
      : Promise.resolve({ data: [] as { id: string; abstract: string | null }[] }),
  ]);
  const usedIds = card && letter ? usedFacts(card, letter.blocks).map((f) => f.id) : [];
  const abstractOf = new Map(((papers ?? []) as { id: string; abstract: string | null }[]).map((p) => [p.id, p.abstract]));
  const prevById: Record<string, string> = {};
  for (const g of groups) {
    if (!g.source.paperId) continue;
    for (const f of g.facts) {
      const p = prevSentence(abstractOf.get(g.source.paperId), f.text);
      if (p) prevById[`${f.rowId}:${f.line}`] = p;
    }
  }
  return { q, table, letter: letter ? { id: letter.id, status: letter.status } : null, usedIds, prevById };
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
  // 56차 D · 원천 · 카드 · 메타를 동시에 읽고, 수치 대조는 읽은 카드를 쓴다(전에는 카드를 두 번 읽었다)
  // 질문에서 나온 글(20차)은 왼쪽에 사실 카드를 둔다. 옛 글은 원천 초록을 둔다.
  const [sources, card, meta] = await Promise.all([
    t.step("원천", loadLetterSources(db, id)),
    data.question_id ? t.step("사실 카드", loadQuestionCard(db, data.question_id)) : Promise.resolve(null),
    data.question_id ? t.step("메타 파일", readDraftMeta(db, id)) : Promise.resolve(null),
  ]);
  const mismatches = await t.step("카드 수치 대조", numberMismatchesFor(db, data.question_id, data.blocks, meta?.glossary ?? [], card));
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
  // 56차 D · 원천 · 카드 · 메타를 동시에 읽는다. 카드 문장과 뜻 확인 수는 같은 카드로 계산한다(전에는 카드를 두 번 읽었다)
  const titleEditable = data.status === "review" || data.status === "reviewed";
  const [sources, card, draftMeta] = await Promise.all([
    t.step("원천", loadLetterSources(db, id)),
    data.question_id ? t.step("사실 카드", loadQuestionCard(db, data.question_id)) : Promise.resolve(null),
    // 48차 A · D51 · 리뷰 대기 · 리뷰 통과 글은 제목 · 요약만 여기서 고칠 수 있다
    titleEditable ? t.step("메타 파일", readDraftMeta(db, id)) : Promise.resolve(null),
  ]);
  // 화면을 열 때마다 다시 점검한다. 자동 점검은 돈이 들지 않는다. 링크 결과는 10분 저장본을 쓴다(승인 창은 늘 새로 확인).
  const checks = await t.step(
    "자동 점검(링크 포함)",
    runReviewChecks({
      blocks: data.blocks,
      sourceUrls: linkCheckUrls(sources),
      sourceTags: sources.map((s) => s.tag),
      summary: data.summary,
      cardSentences: card ? card.facts.map((f) => f.text) : [],
      linkCheck: checkLinkCached,
    }),
  );
  // 45차 C · D50 · 쓰인 문장 뜻 확인 수(알림만)
  const meaning = meaningStatusFrom(card, data.blocks, data.question_id);
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
