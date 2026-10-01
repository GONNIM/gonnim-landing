"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { dominanceContext } from "@/lib/dominance/guard";
import { dominanceLetterUrl } from "@/lib/dominance/db";
import { loadFactCards, loadLetterSources } from "@/lib/dominance/letters";
import { runCrossReview } from "@/lib/dominance/cross-review";
import { loadCardSentences, loadQuestionCard, numberPairs } from "@/lib/dominance/card";
import { isReviewPassable, linkCheckUrls, runReviewChecks } from "@/lib/dominance/review";
import { toEmailHtml, toPayload, toPlainText } from "@/lib/dominance/render";
import type {
  CrossReviewNote,
  LetterBlock,
  ReviewChecks,
} from "@/lib/dominance/types";
import { MODEL_MAIN } from "@/lib/dominance/llm";

type LetterRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  status: string;
  review_checks: ReviewChecks | null;
  revision_count: number;
  question_id: string | null;
};

const LETTER_SELECT =
  "id, slug, title, summary, blocks, status, review_checks, revision_count, question_id";

async function loadLetter(
  db: Awaited<ReturnType<typeof dominanceContext>>["db"],
  id: string,
) {
  const { data } = await db
    .from("ds_letters")
    .select(LETTER_SELECT)
    .eq("id", id)
    .maybeSingle<LetterRow>();
  return data;
}

/** 교차 리뷰는 돈이 든다. 결과를 review_checks 에 넣어 두고 다시 부르지 않는다. */
export async function requestCrossReview(
  letterId: string,
): Promise<{ notes: CrossReviewNote[]; error: string | null }> {
  const { db } = await dominanceContext();

  const letter = await loadLetter(db, letterId);
  if (!letter) return { notes: [], error: "글을 찾지 못했습니다" };

  const sources = await loadLetterSources(db, letterId);

  let notes: CrossReviewNote[];
  try {
    notes = await runCrossReview({
      title: letter.title,
      blocks: letter.blocks,
      cards: await loadFactCards(db, letter.question_id, sources),
      // 22차 C-2 · "절반 · 배 · %" 문장은 카드 원문 · 확인된 뜻과 따로 대조한다
      numberPairs: letter.question_id
        ? numberPairs(letter.blocks, (await loadQuestionCard(db, letter.question_id))!)
        : undefined,
    });
  } catch (err) {
    return { notes: [], error: err instanceof Error ? err.message : String(err) };
  }

  const checks = await runReviewChecks({
    blocks: letter.blocks,
    sourceUrls: linkCheckUrls(sources),
    sourceTags: sources.map((s) => s.tag),
    summary: letter.summary,
    cardSentences: await loadCardSentences(db, letter.question_id),
  });

  const snapshot: ReviewChecks = {
    checks,
    crossReview: notes,
    checkedAt: new Date().toISOString(),
  };

  await db
    .from("ds_letters")
    .update({ review_checks: snapshot })
    .eq("id", letterId);

  await db.from("ds_letter_audit").insert({
    letter_id: letterId,
    event: "cross_review",
    model: MODEL_MAIN,
    raw_output: JSON.stringify(notes),
    passed: notes.length === 0,
  });

  revalidatePath(`/dominance/review/${letterId}`);
  return { notes, error: null };
}

/** [내게 테스트 발송] · 구독자에게 가지 않는다. 관리자 주소로만 보낸다. */
export async function sendTestEmail(
  letterId: string,
): Promise<{ error: string | null; to: string | null }> {
  const { admin, db } = await dominanceContext();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY 없음", to: null };

  const letter = await loadLetter(db, letterId);
  if (!letter) return { error: "글을 찾지 못했습니다", to: null };

  const sources = await loadLetterSources(db, letterId);
  const payload = toPayload({
    slug: letter.slug,
    title: letter.title,
    summary: letter.summary,
    publishedAt: null,
    blocks: letter.blocks,
    sources,
  });

  const html = toEmailHtml(payload, {
    webUrl: dominanceLetterUrl(letter.slug),
    // 테스트 발송은 브로드캐스트가 아니라서 Resend 병합 태그가 바뀌지 않는다. 우리 수신거부 화면을 건다.
    unsubscribeUrl: "https://gonnim.dev/sangsik/unsubscribe",
  });

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.DS_FROM_EMAIL || "지배상식 <letter@gonnim.dev>",
      to: admin.email,
      subject: `[테스트] ${letter.title}`,
      html,
      text: toPlainText(payload, "https://gonnim.dev/sangsik/unsubscribe"),
    });
    if (error) return { error: error.message, to: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), to: null };
  }

  return { error: null, to: admin.email };
}

/** [리뷰 통과] · 막는 항목이 하나라도 남으면 거부한다. */
export async function passReview(
  letterId: string,
): Promise<{ error: string | null }> {
  const { admin, db } = await dominanceContext();

  const letter = await loadLetter(db, letterId);
  if (!letter) return { error: "글을 찾지 못했습니다" };
  if (letter.status !== "review") {
    return { error: "리뷰 대기 상태가 아닙니다" };
  }

  const sources = await loadLetterSources(db, letterId);
  const checks = await runReviewChecks({
    blocks: letter.blocks,
    sourceUrls: linkCheckUrls(sources),
    sourceTags: sources.map((s) => s.tag),
    summary: letter.summary,
    cardSentences: await loadCardSentences(db, letter.question_id),
  });

  if (!isReviewPassable(checks)) {
    return { error: "막는 항목이 남아 있습니다. 고친 뒤에 다시 올리십시오." };
  }

  const now = new Date().toISOString();
  const snapshot: ReviewChecks = {
    checks,
    crossReview: letter.review_checks?.crossReview ?? [],
    checkedAt: now,
  };

  const { error } = await db
    .from("ds_letters")
    .update({
      status: "reviewed",
      reviewed_at: now,
      reviewed_by: admin.email,
      review_checks: snapshot,
      updated_at: now,
    })
    .eq("id", letterId)
    .eq("status", "review");

  if (error) return { error: error.message };

  await db.from("ds_letter_audit").insert({
    letter_id: letterId,
    event: "review_pass",
    passed: true,
    note: `${admin.email} 리뷰 통과`,
  });

  revalidatePath("/dominance/review");
  revalidatePath("/dominance/schedule");
  revalidatePath("/dominance");
  return { error: null };
}

/** [수정으로 되돌리기] · 이유를 한 줄 남긴다. 횟수 제한은 두지 않는다. */
export async function revertToDraft(
  letterId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { admin, db } = await dominanceContext();

  const letter = await loadLetter(db, letterId);
  if (!letter) return { error: "글을 찾지 못했습니다" };

  // 발행된 글은 되돌리지 않는다. 고칠 것이 있으면 정정으로 처리한다.
  if (letter.status === "published") {
    return { error: "발행된 글은 되돌릴 수 없습니다. 정정으로 처리하십시오." };
  }
  if (letter.status === "draft") {
    return { error: "이미 쓰는 중인 글입니다." };
  }

  // 발행 예정 글을 되돌리면 발행일과 승인 기록도 함께 지운다.
  // 남겨 두면 다시 리뷰를 통과했을 때 옛 발행일이 그대로 붙어 있게 된다.
  const wasApproved = letter.status === "approved";

  const now = new Date().toISOString();
  const { error } = await db
    .from("ds_letters")
    .update({
      status: "draft",
      // 리뷰 기록을 지운다. 되돌린 글은 다시 리뷰를 받아야 발행일을 붙일 수 있다.
      reviewed_at: null,
      reviewed_by: null,
      ...(wasApproved ? { scheduled_for: null, approved_at: null, approved_by: null } : {}),
      revision_count: letter.revision_count + 1,
      updated_at: now,
    })
    .eq("id", letterId)
    // 읽은 뒤 다른 곳에서 발행되었으면 바꾸지 않는다.
    .eq("status", letter.status);

  if (error) return { error: error.message };

  await db.from("ds_letter_audit").insert({
    letter_id: letterId,
    event: "review_reject",
    passed: false,
    note: `${admin.email}: ${reason.trim() || "사유 없음"}${wasApproved ? " · 발행 예정에서 되돌림(발행일 · 승인 기록 지움)" : ""}`,
  });

  revalidatePath("/dominance/review");
  revalidatePath("/dominance/letters");
  revalidatePath("/dominance");
  return { error: null };
}
