// 56차 B · 승인(날짜 붙이기)의 공통 몸통 · D55 자동 날짜 붙이기.
//
// ⑤ 승인 창의 서버 동작(app/dominance/schedule/actions.ts)과 매일 크론, 운영자 지시 스크립트가 같은 함수를 지난다.
// 검사는 승인 창과 같다: 발행 시작(D40) · 날짜 · 리뷰 통과 · 원천 링크 재점검 · 뜻 확인(D50).
// 승인하면 ds_letter_audit 에 approve(사람 · 운영자 지시) 또는 auto_approve(크론)를 남긴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { meaningStatus } from "./card";
import { readVoteCandidates, writeVoteCandidates, type VoteCandidate } from "./draft-store";
import { kstDateAfter, kstToday } from "./kst";
import { loadLetterSources } from "./letters";
import { PRE_PUBLISHING_REASON, publishingStarted } from "./publishing";
import { linkCheckUrls, runReviewChecks } from "./review";
import type { LetterBlock, LetterStatus } from "./types";

export type LinkRecheck = { ok: boolean; detail: string; checkedAt: string };

/** 원천 링크를 한 번 더 확인한다. 죽은 링크가 있으면 승인을 막는다. */
export async function recheckLetterLinks(db: SupabaseClient, letterId: string): Promise<LinkRecheck> {
  const { data } = await db
    .from("ds_letters")
    .select("id, summary, blocks")
    .eq("id", letterId)
    .maybeSingle<{ id: string; summary: string | null; blocks: LetterBlock[] }>();
  if (!data) return { ok: false, detail: "글을 찾지 못했습니다", checkedAt: "" };

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

export type ApproveResult = { error: string | null; warning: string | null; links?: LinkRecheck };

/** 승인 몸통 · by 는 approved_by 에 들어갈 주소, note 는 감사 기록 글자 */
export async function approveLetterCore(
  db: SupabaseClient,
  letterId: string,
  date: string,
  opts: { by: string; event: "approve" | "auto_approve"; note: string },
): Promise<ApproveResult> {
  // D40 · 발행 시작 선언 전에는 서버에서도 거부한다.
  if (!publishingStarted()) return { error: PRE_PUBLISHING_REASON, warning: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "날짜 형식이 올바르지 않습니다", warning: null };

  const today = kstToday();
  // 크론은 오늘 날짜만 본다. 지난 날짜를 붙이면 영원히 발행되지 않는다.
  if (date < today) return { error: "지난 날짜에는 붙일 수 없습니다", warning: null };

  const { data: letter } = await db
    .from("ds_letters")
    .select("id, title, status, reviewed_at")
    .eq("id", letterId)
    .maybeSingle<{ id: string; title: string; status: LetterStatus; reviewed_at: string | null }>();
  if (!letter) return { error: "글을 찾지 못했습니다", warning: null };
  if (letter.status === "published") return { error: "이미 발행된 글은 날짜를 바꿀 수 없습니다", warning: null };
  if (!letter.reviewed_at) return { error: "리뷰를 통과하지 않은 글입니다", warning: null };

  const links = await recheckLetterLinks(db, letterId);
  if (!links.ok) return { error: `원천 링크 문제: ${links.detail}`, warning: null, links };

  // 45차 C · D50 · 쓰인 문장의 뜻을 모두 확인해야 승인한다(옛 글 · 카드 없는 글은 해당 없음).
  const meaning = await meaningStatus(db, letterId);
  if (meaning.applicable && meaning.verified < meaning.used) {
    return { error: `쓰인 문장의 뜻 ${meaning.used - meaning.verified}개가 확인되지 않았습니다`, warning: null, links };
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("ds_letters")
    .update({ status: "approved", scheduled_for: date, approved_at: now, approved_by: opts.by, updated_at: now })
    .eq("id", letterId)
    .in("status", ["reviewed", "approved"]);
  if (error) return { error: error.message, warning: null, links };

  await db.from("ds_letter_audit").insert({
    letter_id: letterId,
    event: opts.event,
    model: null,
    passed: true,
    prompt_input: { date, links: links.detail, meaning: meaning.applicable ? `${meaning.verified}/${meaning.used}` : "해당 없음" },
    note: opts.note,
  });

  // 같은 날짜에 이미 다른 글이 있으면 막지 않고 알린다. 둘 다 발행된다.
  const { data: sameDay } = await db
    .from("ds_letters")
    .select("id")
    .eq("scheduled_for", date)
    .in("status", ["approved", "published"])
    .neq("id", letterId);

  const warnings: string[] = [];
  if (sameDay && sameDay.length > 0) warnings.push(`이 날짜에 글이 ${sameDay.length + 1}편입니다. 모두 발행됩니다.`);
  if (date === today) warnings.push("오늘 07시가 지났으면 내일 발행됩니다.");
  return { error: null, warning: warnings.join(" ") || null, links };
}

/** 56차 B · 투표 후보 자동 고르기 · 검증 통과 질문 중 V5(위키 30일 조회 en + ko)가 높은 3개 */
export async function pickVoteCandidatesByV5(db: SupabaseClient, letterId: string): Promise<VoteCandidate[]> {
  const { data: letter } = await db.from("ds_letters").select("question_id").eq("id", letterId).maybeSingle<{ question_id: string | null }>();
  const { data } = await db
    .from("ds_questions")
    .select("id, question, v5_wiki_en_30d, v5_wiki_ko_30d")
    .eq("status", "validated")
    .limit(200);
  const rows = ((data ?? []) as { id: string; question: string; v5_wiki_en_30d: number | null; v5_wiki_ko_30d: number | null }[])
    .filter((q) => q.id !== letter?.question_id)
    .map((q) => ({ id: q.id, question: q.question, v5: (q.v5_wiki_en_30d ?? 0) + (q.v5_wiki_ko_30d ?? 0) }))
    .sort((a, b) => b.v5 - a.v5)
    .slice(0, 3);
  const picked = rows.map(({ id, question }) => ({ id, question }));
  await writeVoteCandidates(db, letterId, picked);
  return picked;
}

const MWF = new Set([1, 3, 5]);
/** "YYYY-MM-DD" 의 요일(0=일) · 날짜만 보므로 시간대와 무관 */
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/** 내일 이후 첫 빈 월·수·금 · 빈 날 = 승인 · 발행 글이 없는 날 */
export async function nextFreeMwf(db: SupabaseClient, taken?: Set<string>): Promise<string> {
  const from = kstDateAfter(1);
  const { data } = await db.from("ds_letters").select("scheduled_for").gte("scheduled_for", from).in("status", ["approved", "published"]);
  const used = new Set([...(taken ?? []), ...((data ?? []) as { scheduled_for: string }[]).map((r) => r.scheduled_for)]);
  for (let i = 1; i <= 60; i++) {
    const d = kstDateAfter(i);
    if (MWF.has(weekday(d)) && !used.has(d)) return d;
  }
  throw new Error("60일 안에 빈 월·수·금이 없습니다");
}

export type AutoScheduleResult = { lines: string[]; skipped: string[] };

/**
 * D55 · 자동 날짜 붙이기(매일 크론 · 발행 앞 단계).
 * 조건: DS_PUBLISHING_STARTED=1 · 상태 reviewed · 뜻 확인 m=n(카드가 있는 글만).
 * 리뷰 통과가 빠른 글부터 다음 빈 월·수·금에 하루 한 편씩 붙이고 승인한다. 같은 날 두 편은 붙이지 않는다.
 */
export async function autoScheduleReviewed(db: SupabaseClient): Promise<AutoScheduleResult> {
  const out: AutoScheduleResult = { lines: [], skipped: [] };
  if (!publishingStarted()) return out;
  const { data } = await db
    .from("ds_letters")
    .select("id, title, reviewed_at")
    .eq("status", "reviewed")
    .not("reviewed_at", "is", null)
    .order("reviewed_at", { ascending: true });
  const taken = new Set<string>();
  for (const l of (data ?? []) as { id: string; title: string; reviewed_at: string }[]) {
    const m = await meaningStatus(db, l.id);
    if (!m.applicable || m.verified < m.used) {
      out.skipped.push(`${l.title} · 뜻 확인 ${m.applicable ? `${m.verified}/${m.used}` : "해당 없음"}`);
      continue;
    }
    const date = await nextFreeMwf(db, taken);
    const r = await approveLetterCore(db, l.id, date, {
      by: "cron",
      event: "auto_approve",
      note: `자동 날짜 붙이기(D55) · 리뷰 통과와 뜻 확인 ${m.verified}/${m.used} 완료 · ${date}`,
    });
    if (r.error) {
      out.skipped.push(`${l.title} · ${r.error}`);
      continue;
    }
    taken.add(date);
    if ((await readVoteCandidates(db, l.id)).length === 0) await pickVoteCandidatesByV5(db, l.id);
    out.lines.push(`자동 승인 ${l.title} → ${date}`);
  }
  return out;
}
