// 59차 C · 글 한 편의 꾸러미(본문 · 원천 · 날짜 · 감사 기록)를 JSON 으로 돌려준다.
//
// 「기록」 상세 화면이 이 함수를 쓴다. 다음 차수의 변환(블로그 글 · 쇼츠 대본)도 이 함수의 결과를 입력으로 쓴다.
// 읽기만 한다. 값은 모두 JSON 으로 옮길 수 있는 글자 · 숫자 · null 이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dominanceLetterUrl } from "./db";
import { loadLetterSources } from "./letters";
import { BLOCK_LABEL, BLOCK_ORDER, type BlockKind, type LetterBlock, type LetterStatus } from "./types";

export type PackageBlock = { kind: BlockKind; label: string; text: string };
export type PackageSource = { tag: string | null; kind: string; title: string; url: string; license: string };
export type PackageAudit = { at: string; event: string; label: string; passed: boolean | null; note: string | null; model: string | null };

export type LetterPackage = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: LetterStatus;
  webUrl: string | null;
  questionId: string | null;
  /** 7블록 · BLOCK_ORDER 순 · 본문의 인라인 태그([E1] 등)를 그대로 둔다 */
  blocks: PackageBlock[];
  sources: PackageSource[];
  /** 모두 ISO 시각(scheduledFor 만 "YYYY-MM-DD") · 기록이 없으면 null */
  dates: {
    created: string | null;
    /** 「작성 완료」 · 감사 기록 review_submit 의 마지막 시각(65차 A) · 그 전에 나간 글은 null */
    finished: string | null;
    reviewed: string | null;
    approved: string | null;
    scheduledFor: string | null;
    published: string | null;
    sent: string | null;
  };
  approvedBy: string | null;
  /** 사람 · 자동(D55 · approved_by "cron") */
  approvedKind: "사람" | "자동" | null;
  sentCount: number | null;
  audit: PackageAudit[];
};

export const AUDIT_LABEL: Record<string, string> = {
  draft: "초안 작성(기계)",
  cross_review: "교차 리뷰",
  review_pass: "리뷰 통과",
  review_reject: "수정으로 되돌림",
  title_edit: "제목 · 요약 고침",
  approve: "승인(사람)",
  auto_approve: "승인(자동 · D55)",
  review_submit: "작성 완료",
  approve_cancel: "승인 취소",
};

type LetterRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: LetterStatus;
  blocks: LetterBlock[] | null;
  question_id: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  sent_at: string | null;
  sent_count: number | null;
};

export const approvedKindOf = (by: string | null): "사람" | "자동" | null => (by ? (by === "cron" ? "자동" : "사람") : null);

export async function letterPackage(db: SupabaseClient, letterId: string): Promise<LetterPackage | null> {
  const [{ data: letter }, sources, { data: audit }] = await Promise.all([
    db
      .from("ds_letters")
      .select("id, slug, title, summary, status, blocks, question_id, created_at, reviewed_at, approved_at, approved_by, scheduled_for, published_at, sent_at, sent_count")
      .eq("id", letterId)
      .maybeSingle<LetterRow>(),
    loadLetterSources(db, letterId),
    db.from("ds_letter_audit").select("event, created_at, passed, note, model").eq("letter_id", letterId).order("created_at"),
  ]);
  if (!letter) return null;

  const byKind = new Map((letter.blocks ?? []).map((b) => [b.kind, b.text]));
  return {
    id: letter.id,
    slug: letter.slug,
    title: letter.title,
    summary: letter.summary,
    status: letter.status,
    webUrl: letter.status === "published" ? dominanceLetterUrl(letter.slug) : null,
    questionId: letter.question_id,
    blocks: BLOCK_ORDER.map((kind) => ({ kind, label: BLOCK_LABEL[kind], text: byKind.get(kind) ?? "" })),
    sources: sources
      .map((s) => ({ tag: s.tag, kind: s.label, title: s.title, url: s.url, license: s.licenseLabel }))
      .sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "", "en", { numeric: true })),
    dates: {
      created: letter.created_at,
      finished: ((audit ?? []) as { event: string; created_at: string }[]).filter((a) => a.event === "review_submit").at(-1)?.created_at ?? null,
      reviewed: letter.reviewed_at,
      approved: letter.approved_at,
      scheduledFor: letter.scheduled_for,
      published: letter.published_at,
      sent: letter.sent_at,
    },
    approvedBy: letter.approved_by,
    approvedKind: approvedKindOf(letter.approved_by),
    sentCount: letter.sent_count,
    audit: ((audit ?? []) as { event: string; created_at: string; passed: boolean | null; note: string | null; model: string | null }[]).map((a) => ({
      at: a.created_at,
      event: a.event,
      label: AUDIT_LABEL[a.event] ?? a.event,
      passed: a.passed,
      note: a.note,
      model: a.model,
    })),
  };
}
