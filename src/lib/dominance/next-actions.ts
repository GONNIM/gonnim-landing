// 48차 G · D53 · 현황 화면의 「다음 할 일」. 글 한 편에 한 줄, 질문 하나에 한 줄.
//
// 상태 숫자보다 "지금 무엇을 누를지" 를 먼저 보인다. 발행된 글은 넣지 않는다. 글을 먼저, 질문을 나중에 둔다.
// 뜻 확인 수는 card.meaningStatus(D50 · 증거 표 노란 상자와 같은 계산), 발행 시작은 DS_PUBLISHING_STARTED === "1".

import type { SupabaseClient } from "@supabase/supabase-js";
import { meaningStatus } from "./card";
import { formatKstDate } from "./kst";
import { holdNext, holdReason, loadQuestions } from "./questions";
import { publishingStarted } from "./publishing";
import type { LetterStatus } from "./types";

export type NextAction = {
  kind: "letter" | "question";
  id: string;
  title: string;
  line: string;
  href: string | null;
  buttonLabel: string | null;
  /** 글 줄 아래 작은 글자(쓰는 중 · 리뷰 대기 글의 뜻 확인 m/n) */
  sub?: { line: string; href: string } | null;
  /** 54차 D · 접지 않고 글 줄 바로 아래에 보일 질문(보류 · 채택 후 글 없음) */
  pinned?: boolean;
};

export async function loadNextActions(db: SupabaseClient): Promise<NextAction[]> {
  const started = publishingStarted();
  const { data: letters } = await db
    .from("ds_letters")
    .select("id, title, status, scheduled_for, question_id, updated_at")
    .neq("status", "published")
    .order("updated_at", { ascending: false });

  const out: NextAction[] = [];
  const withLetter = new Set<string>();
  for (const l of (letters ?? []) as { id: string; title: string; status: LetterStatus; scheduled_for: string | null; question_id: string | null }[]) {
    if (l.question_id) withLetter.add(l.question_id);
    const m = await meaningStatus(db, l.id);
    const short = m.applicable && m.verified < m.used;
    // 54차 D · 증거 표 노란 상자로 바로(앵커)
    const evidence = m.questionId ? `/dominance/questions/${m.questionId}/evidence#used-facts` : null;
    const base = { kind: "letter" as const, id: l.id, title: l.title };
    const sub = short && evidence ? { line: `뜻 확인 ${m.verified}/${m.used}`, href: evidence } : null;
    if (l.status === "draft") {
      out.push({ ...base, line: "본문을 고치고 [작성 완료]를 누르십시오", href: `/dominance/letters/${l.id}`, buttonLabel: "열기", sub });
    } else if (l.status === "review") {
      out.push({ ...base, line: "리뷰하십시오", href: `/dominance/review/${l.id}`, buttonLabel: "열기", sub });
    } else if (l.status === "reviewed") {
      if (short) out.push({ ...base, line: `뜻 확인 ${m.verified}/${m.used}`, href: evidence, buttonLabel: "열기" });
      else if (!started) out.push({ ...base, line: "발행 시작 선언을 기다립니다", href: null, buttonLabel: null });
      else out.push({ ...base, line: "발행일을 붙이십시오", href: "/dominance/schedule", buttonLabel: "열기" });
    } else if (l.status === "approved") {
      out.push({ ...base, line: `${formatKstDate(l.scheduled_for)} 07시에 나갑니다`, href: null, buttonLabel: null });
    }
  }

  const { questions } = await loadQuestions(db);
  for (const q of questions) {
    const base = { kind: "question" as const, id: q.id, title: q.question };
    if (q.status === "held") {
      out.push({ ...base, line: `보류 · ${holdReason(q)} · ${holdNext(q).join(" / ")}`, href: "/dominance/questions", buttonLabel: "열기", pinned: true });
    } else if (q.status === "validated" && q.v3EvidenceOk === true) {
      out.push({ ...base, line: "채택할 수 있습니다", href: "/dominance/questions", buttonLabel: "열기" });
    } else if (q.status === "adopted" && !withLetter.has(q.id)) {
      out.push({ ...base, line: "[글 작성하기]를 누르십시오", href: `/dominance/questions/${q.id}/evidence`, buttonLabel: "열기", pinned: true });
    }
  }
  return out;
}
