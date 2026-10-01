// 독자 반응 4층 (D42 · 26차 C) · 레터별 숫자만 저장한다.
//
// ① 열람 · 클릭: Resend 웹훅(/api/sangsik/resend-webhook). 클릭은 링크 종류별로도 센다.
// ② 끝 도달: 웹 글 페이지의 작은 신호(/api/sangsik/signal) · 쿠키 · 식별자 없음.
// ③ 반응 3개 · ④ 다음 질문 투표: 메일 · 페이지 하단 링크(/api/sangsik/react).
// 답장 수는 운영자가 콘솔에서 손으로 적는다.
//
// 개인을 저장하지 않는다. 같은 사람의 중복만 ds_reaction_dedupe 의 HMAC 해시로 막는다.
// 숫자 올리기는 읽고-쓰기다(PostgREST 에 증가 연산이 없다). 동시에 두 번 오면 updated_at 으로
// 겹침을 알아채고 다시 한다.

import type { SupabaseClient } from "@supabase/supabase-js";

import { signLetterKind } from "@/lib/sangsik/token";
import { SANGSIK_BASE } from "@/lib/sangsik/site";

const SITE_ORIGIN = new URL(SANGSIK_BASE).origin;

export const REACT_KINDS = ["new", "known", "more"] as const;
export type ReactKind = (typeof REACT_KINDS)[number];
export const REACT_LABEL: Record<ReactKind, string> = { new: "몰랐다", known: "알고 있었다", more: "더 알고 싶다" };
const REACT_COLUMN: Record<ReactKind, "react_new" | "react_known" | "react_more"> = {
  new: "react_new",
  known: "react_known",
  more: "react_more",
};

export const CLICK_KINDS = ["source", "web", "unsubscribe", "react", "vote", "other"] as const;
export type ClickKind = (typeof CLICK_KINDS)[number];
export const CLICK_LABEL: Record<ClickKind, string> = {
  source: "원천",
  web: "웹에서 보기",
  unsubscribe: "수신거부",
  react: "반응",
  vote: "투표",
  other: "기타",
};

/** 클릭 종류 칸(db/2026-10-01-dominance-click-kinds.sql) 전에는 next_votes 의 이 키에 둔다 */
export const CLICK_FALLBACK_KEY = "_clicks";

export type ReactionRow = {
  letter_id: string;
  opens: number;
  clicks: number;
  end_reached: number;
  react_new: number;
  react_known: number;
  react_more: number;
  next_votes: Record<string, unknown>;
  replies: number;
  updated_at: string;
  click_kinds?: Record<string, number> | null;
};

export type Bump = {
  opens?: number;
  clicks?: number;
  clickKind?: ClickKind;
  end?: number;
  react?: ReactKind;
  vote?: string;
};

let clickColumn: boolean | null = null;
export async function hasClickKindsColumn(db: SupabaseClient): Promise<boolean> {
  if (clickColumn !== null) return clickColumn;
  const { error } = await db.from("ds_letter_reactions").select("click_kinds").limit(1);
  clickColumn = !error;
  return clickColumn;
}

export function clickKindsOf(r: ReactionRow): Record<string, number> {
  // SQL 전에 센 것(예약 키)과 SQL 뒤에 센 것(칸)을 더한다.
  const out: Record<string, number> = {};
  for (const src of [r.next_votes?.[CLICK_FALLBACK_KEY] as Record<string, number> | undefined, r.click_kinds ?? undefined])
    for (const [k, v] of Object.entries(src ?? {})) out[k] = (out[k] ?? 0) + (typeof v === "number" ? v : 0);
  return out;
}

/** 투표 수만(클릭 종류 대체 키를 뺀다) */
export function votesOf(r: ReactionRow): Record<string, number> {
  return Object.fromEntries(
    Object.entries(r.next_votes ?? {}).filter(([k, v]) => k !== CLICK_FALLBACK_KEY && typeof v === "number"),
  ) as Record<string, number>;
}

/**
 * 같은 사람의 두 번째 반응인지 본다. 처음이면 해시를 넣고 true.
 * hash 는 token.ts 의 dedupeHash 로 만든다.
 */
export async function firstTime(
  db: SupabaseClient,
  letterId: string,
  kind: "open" | "click" | "end" | "react" | "vote",
  hash: string,
): Promise<boolean> {
  const { error } = await db.from("ds_reaction_dedupe").insert({ letter_id: letterId, kind, hash });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`중복 막기 기록 실패: ${error.message}`);
}

export async function bumpReaction(db: SupabaseClient, letterId: string, b: Bump): Promise<void> {
  const col = await hasClickKindsColumn(db);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("ds_letter_reactions")
      .select(col ? "*, click_kinds" : "*")
      .eq("letter_id", letterId)
      .maybeSingle();
    if (error) throw new Error(`반응 읽기 실패: ${error.message}`);
    const cur = data as unknown as ReactionRow | null;

    const next: Record<string, unknown> = {
      opens: (cur?.opens ?? 0) + (b.opens ?? 0),
      clicks: (cur?.clicks ?? 0) + (b.clicks ?? 0),
      end_reached: (cur?.end_reached ?? 0) + (b.end ?? 0),
      updated_at: new Date().toISOString(),
    };
    if (b.react) next[REACT_COLUMN[b.react]] = (cur?.[REACT_COLUMN[b.react]] ?? 0) + 1;
    const votes = { ...(cur?.next_votes ?? {}) } as Record<string, unknown>;
    let votesChanged = false;
    if (b.vote) {
      votes[b.vote] = ((votes[b.vote] as number | undefined) ?? 0) + 1;
      votesChanged = true;
    }
    if (b.clickKind) {
      if (col) {
        const kinds = { ...(cur?.click_kinds ?? {}) };
        kinds[b.clickKind] = (kinds[b.clickKind] ?? 0) + 1;
        next.click_kinds = kinds;
      } else {
        const kinds = { ...((votes[CLICK_FALLBACK_KEY] as Record<string, number> | undefined) ?? {}) };
        kinds[b.clickKind] = (kinds[b.clickKind] ?? 0) + 1;
        votes[CLICK_FALLBACK_KEY] = kinds;
        votesChanged = true;
      }
    }
    if (votesChanged) next.next_votes = votes;

    if (!cur) {
      const { error: e } = await db.from("ds_letter_reactions").insert({ letter_id: letterId, ...next });
      if (!e) return;
      if (e.code === "23505") continue; // 다른 요청이 먼저 행을 만들었다
      throw new Error(`반응 저장 실패: ${e.message}`);
    }
    const { data: up, error: e } = await db
      .from("ds_letter_reactions")
      .update(next)
      .eq("letter_id", letterId)
      .eq("updated_at", cur.updated_at)
      .select("letter_id");
    if (e) throw new Error(`반응 저장 실패: ${e.message}`);
    if ((up ?? []).length === 1) return;
  }
  throw new Error("반응 저장이 다섯 번 겹쳤습니다");
}

/** 답장 수 · 운영자가 손으로 적는다(26차 C-3). */
export async function setReplies(db: SupabaseClient, letterId: string, replies: number): Promise<void> {
  const n = Math.max(0, Math.floor(replies));
  const { error } = await db
    .from("ds_letter_reactions")
    .upsert({ letter_id: letterId, replies: n, updated_at: new Date().toISOString() }, { onConflict: "letter_id" });
  if (error) throw new Error(`답장 수 저장 실패: ${error.message}`);
}

/**
 * 메일 클릭 링크의 종류. Resend 클릭 추적은 원래 주소를 click.link 로 준다.
 * 원천 주소 목록은 그 레터의 원천이다.
 */
export function classifyLink(link: string, sourceUrls: string[]): ClickKind {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return "other";
  }
  if (u.pathname.startsWith("/api/sangsik/react")) return u.searchParams.get("k")?.startsWith("vote") ? "vote" : "react";
  if (u.pathname.startsWith("/sangsik/l/")) return "web";
  if (/unsubscribe/i.test(u.pathname) || /unsubscribe/i.test(u.hostname)) return "unsubscribe";
  const norm = (x: string) => x.replace(/\/+$/, "").replace(/^http:/, "https:");
  if (sourceUrls.some((s) => norm(s) === norm(link))) return "source";
  return "other";
}

/** 반응 · 투표 링크 하나. reader 는 메일이면 "{{{contact.ds_rk|web}}}", 웹이면 "web". */
export function reactUrl(letterId: string, kind: string, reader: string): string {
  const q = `l=${letterId}&k=${encodeURIComponent(kind)}&s=${signLetterKind(letterId, kind)}&r=${reader}`;
  return `${SITE_ORIGIN}/api/sangsik/react?${q}`;
}

export type ReactionLinks = {
  reacts: { label: string; url: string }[];
  votes: { label: string; url: string }[];
};

/** 레터 한 편의 반응 3개 · 투표 링크. 투표 후보가 없으면 투표 줄을 그리지 않는다. */
export function reactionLinks(
  letterId: string,
  votes: { id: string; question: string }[],
  reader: string,
): ReactionLinks {
  return {
    reacts: REACT_KINDS.map((k) => ({ label: REACT_LABEL[k], url: reactUrl(letterId, `react:${k}`, reader) })),
    votes: votes.slice(0, 3).map((v) => ({ label: v.question, url: reactUrl(letterId, `vote:${v.id}`, reader) })),
  };
}
