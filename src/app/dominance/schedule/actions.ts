"use server";

import { PRE_PUBLISHING_REASON, publishingStarted } from "@/lib/dominance/publishing";
import { revalidatePath } from "next/cache";
import { dominanceContext } from "@/lib/dominance/guard";
import { kstToday } from "@/lib/dominance/kst";
import { readVoteCandidates, writeVoteCandidates, type VoteCandidate } from "@/lib/dominance/draft-store";
import { loadLetterSources } from "@/lib/dominance/letters";
import { linkCheckUrls, runReviewChecks } from "@/lib/dominance/review";
import type { LetterBlock, LetterStatus } from "@/lib/dominance/types";

type Row = {
  id: string;
  title: string;
  blocks: LetterBlock[];
  status: LetterStatus;
  reviewed_at: string | null;
};

const SELECT = "id, title, blocks, status, reviewed_at";

function revalidateAll() {
  revalidatePath("/dominance/schedule");
  revalidatePath("/dominance/review");
  revalidatePath("/dominance/letters");
  revalidatePath("/dominance");
}

/** 승인 창을 열 때 원천 링크를 한 번 더 확인한다. 죽은 링크가 있으면 승인을 막는다. */
export async function recheckLinks(
  letterId: string,
): Promise<{ ok: boolean; detail: string; checkedAt: string }> {
  const { db } = await dominanceContext();

  const { data } = await db
    .from("ds_letters")
    .select("id, summary, blocks")
    .eq("id", letterId)
    .maybeSingle<{ id: string; summary: string | null; blocks: LetterBlock[] }>();

  if (!data) {
    return { ok: false, detail: "글을 찾지 못했습니다", checkedAt: "" };
  }

  const sources = await loadLetterSources(db, letterId);
  const checks = await runReviewChecks({
    blocks: data.blocks,
    sourceUrls: linkCheckUrls(sources),
    sourceTags: sources.map((s) => s.tag),
    summary: data.summary,
  });
  const links = checks.find((c) => c.code === "links");

  return {
    ok: links?.passed ?? false,
    // 통과해도 확인 불가(403 · 429)가 남으면 그 목록을 보여 준다. 사람이 직접 눌러 본다 (D35).
    detail: links?.passed
      ? links.detail
        ? `${sources.length}개 중 ${links.detail}`
        : `${sources.length}개 정상`
      : (links?.detail ?? "확인하지 못했습니다"),
    checkedAt: new Date().toISOString(),
  };
}

/** [승인하고 날짜 확정] · 여기를 지나면 크론이 그날 07시에 내보낸다. */
export async function approveLetter(
  letterId: string,
  date: string,
): Promise<{ error: string | null; warning: string | null }> {
  const { admin, db } = await dominanceContext();

  // D40 · 발행 시작 선언 전에는 서버에서도 거부한다.
  if (!publishingStarted()) return { error: PRE_PUBLISHING_REASON, warning: null };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "날짜 형식이 올바르지 않습니다", warning: null };
  }

  const today = kstToday();
  // 크론은 오늘 날짜만 본다. 지난 날짜를 붙이면 영원히 발행되지 않는다.
  if (date < today) {
    return { error: "지난 날짜에는 붙일 수 없습니다", warning: null };
  }

  const { data: letter } = await db
    .from("ds_letters")
    .select(SELECT)
    .eq("id", letterId)
    .maybeSingle<Row>();

  if (!letter) return { error: "글을 찾지 못했습니다", warning: null };
  if (letter.status === "published") {
    return { error: "이미 발행된 글은 날짜를 바꿀 수 없습니다", warning: null };
  }
  if (!letter.reviewed_at) {
    return { error: "리뷰를 통과하지 않은 글입니다", warning: null };
  }

  const links = await recheckLinks(letterId);
  if (!links.ok) {
    return { error: `원천 링크 문제: ${links.detail}`, warning: null };
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("ds_letters")
    .update({
      status: "approved",
      scheduled_for: date,
      approved_at: now,
      approved_by: admin.email,
      updated_at: now,
    })
    .eq("id", letterId)
    .in("status", ["reviewed", "approved"]);

  if (error) return { error: error.message, warning: null };

  // 같은 날짜에 이미 다른 글이 있으면 막지 않고 알린다. 둘 다 발행된다.
  const { data: sameDay } = await db
    .from("ds_letters")
    .select("id")
    .eq("scheduled_for", date)
    .in("status", ["approved", "published"])
    .neq("id", letterId);

  revalidateAll();

  const warnings: string[] = [];
  if (sameDay && sameDay.length > 0) {
    warnings.push(`이 날짜에 글이 ${sameDay.length + 1}편입니다. 모두 발행됩니다.`);
  }
  if (date === today) {
    warnings.push("오늘 07시가 지났으면 내일 발행됩니다.");
  }

  return { error: null, warning: warnings.join(" ") || null };
}

/** [승인 취소] · 발행 전이면 언제든 되돌린다. 리뷰 통과 상태로 돌아간다. */
export async function unapproveLetter(
  letterId: string,
): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();

  const now = new Date().toISOString();
  const { error } = await db
    .from("ds_letters")
    .update({
      status: "reviewed",
      scheduled_for: null,
      approved_at: null,
      approved_by: null,
      updated_at: now,
    })
    .eq("id", letterId)
    .eq("status", "approved");

  if (error) return { error: error.message };

  revalidateAll();
  return { error: null };
}

/** 다음 질문 투표 후보 고르기(26차 C-3) · validated 질문 목록과 이미 고른 것 */
export async function loadVoteChoices(
  letterId: string,
): Promise<{ options: VoteCandidate[]; picked: string[] }> {
  const { db } = await dominanceContext();
  const { data: letter } = await db.from("ds_letters").select("question_id").eq("id", letterId).maybeSingle<{ question_id: string | null }>();
  const { data } = await db
    .from("ds_questions")
    .select("id, question")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(100);
  const options = ((data ?? []) as VoteCandidate[]).filter((q) => q.id !== letter?.question_id);
  const picked = (await readVoteCandidates(db, letterId)).map((c) => c.id);
  return { options, picked };
}

export async function saveVoteChoices(letterId: string, ids: string[]): Promise<{ error: string | null }> {
  const { db } = await dominanceContext();
  if (ids.length > 3) return { error: "후보는 3개까지입니다." };
  const { data } = await db.from("ds_questions").select("id, question, status").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const rows = (data ?? []) as (VoteCandidate & { status: string })[];
  if (rows.some((r) => r.status !== "validated") || rows.length !== ids.length) return { error: "검증 통과(validated) 질문만 고를 수 있습니다." };
  try {
    await writeVoteCandidates(db, letterId, ids.map((id) => rows.find((r) => r.id === id)!).map(({ id, question }) => ({ id, question })));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return { error: null };
}
