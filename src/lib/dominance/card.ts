// ③ 사실 카드 · 증거 표를 글의 재료로 바꾼다 (D33 · 20차 B-1).
//
// 재료는 카드뿐이다. 초록은 넣지 않는다. 카드 = 증거 표의 사실 문장(태그 · 대상 · 연도 · 수치 · 칸)
// + 링크만 있는 원천의 메모 + 원천 목록(태그 · 제목 · 종류) + 우리 집계 [V] 한 줄.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXT_KIND_LABEL,
  SLOTS,
  loadEvidence,
  type Slot,
} from "./evidence";
import { loadQuestion, type Question } from "./questions";
import { sentencesOf, tagsIn } from "./tags";

export type CardFact = {
  /** 문장 하나의 id "<행 id>:<줄>" · 고르기 단계가 이 값으로 고른다 */
  id: string;
  tag: string;
  slot: Slot;
  /** 원문 */
  text: string;
  /** 한국어 뜻(D44). 초안은 이 값만 받는다 */
  ko: string | null;
  koVerifiedAt: string | null;
  subject: string | null;
  year: number | null;
  hasNumber: boolean | null;
};

export type CardSource = {
  tag: string;
  slots: Slot[];
  title: string;
  kind: string;
  url: string;
  linkOnly: boolean;
  memo: string | null;
};

export type QuestionCard = {
  question: Question;
  facts: CardFact[];
  sources: CardSource[];
  /** [V] 우리 집계 한 줄. 연도별 논문 수가 없으면 null */
  vLine: string | null;
  /** 카드에 있는 태그 전부(V 포함) */
  tags: string[];
  filledSlots: number;
};

export const V_TAG = "V";

/** "Europe PMC 검색어 ① 연도별 논문 수: 2016년 180편 → 2025년 352편. 최근 5년 1,948편." */
export function vLineOf(q: Question): string | null {
  const by = q.v4ByYear;
  if (!by) return null;
  const years = Object.entries(by)
    .filter(([k, v]) => /^\d{4}$/.test(k) && typeof v === "number")
    .map(([k, v]) => [Number(k), v as number] as const)
    .sort((a, b) => a[0] - b[0]);
  if (years.length < 2) return null;
  // 올해는 아직 덜 셌다. 지난해까지만 쓴다.
  const lastFull = new Date().getFullYear() - 1;
  const end = years.filter(([y]) => y <= lastFull).at(-1);
  const start = years.find(([y]) => y >= lastFull - 20) ?? years[0];
  if (!end || end[0] === start[0]) return null;
  const n = (x: number) => x.toLocaleString("ko-KR");
  return (
    `Europe PMC 검색어 ① 연도별 논문 수: ${start[0]}년 ${n(start[1])}편 → ${end[0]}년 ${n(end[1])}편.` +
    (q.v1Papers5y !== null ? ` 최근 5년 ${n(q.v1Papers5y)}편.` : "")
  );
}

export function vSearchUrl(q: Question): string {
  return `https://europepmc.org/search?query=${encodeURIComponent(q.searchQueries[0] ?? q.question)}`;
}

export async function loadQuestionCard(db: SupabaseClient, questionId: string): Promise<QuestionCard | null> {
  const q = await loadQuestion(db, questionId);
  if (!q) return null;
  const t = await loadEvidence(db, questionId);

  const facts: CardFact[] = [];
  const sources = new Map<string, CardSource>();
  for (const slot of SLOTS) {
    for (const g of t.slots[slot]) {
      const tag = g.source.tag ?? "?";
      const s = sources.get(tag) ?? {
        tag,
        slots: [],
        title: g.source.title,
        kind:
          g.source.kind === "paper"
            ? `논문${g.facts[0]?.year ? ` ${g.facts[0].year}` : ""}`
            : g.source.kind === "press"
              ? "정부 보도자료"
              : (EXT_KIND_LABEL[g.source.extKind ?? ""] ?? "외부 원천"),
        url: g.source.url,
        linkOnly: g.source.linkOnly,
        memo: g.notes.join(" ") || null,
      };
      if (!s.slots.includes(slot)) s.slots.push(slot);
      sources.set(tag, s);
      for (const f of g.facts) {
        facts.push({
          id: `${f.rowId}:${f.line}`,
          tag,
          slot,
          text: f.text,
          ko: f.ko,
          koVerifiedAt: f.koVerifiedAt,
          subject: f.subject,
          year: f.year,
          hasNumber: f.hasNumber,
        });
      }
    }
  }

  const vLine = vLineOf(q);
  if (vLine) {
    sources.set(V_TAG, {
      tag: V_TAG,
      slots: [],
      title: `지배상식 집계 · Europe PMC 연도별 논문 수 (${new Date().toISOString().slice(0, 10)})`,
      kind: "지배상식 집계",
      url: vSearchUrl(q),
      linkOnly: false,
      memo: null,
    });
  }

  return {
    question: q,
    facts,
    sources: [...sources.values()],
    vLine,
    tags: [...sources.keys()],
    filledSlots: t.filledSlots,
  };
}

/** 리뷰 점검의 "카드 문장 40자 복제" 용. 원천 언어 문장만(메모는 우리 말이라 뺀다). 질문이 없는 옛 글은 빈 배열. */
export async function loadCardSentences(db: SupabaseClient, questionId: string | null): Promise<string[]> {
  if (!questionId) return [];
  const card = await loadQuestionCard(db, questionId);
  if (!card) return [];
  return card.facts.map((f) => f.text);
}

/** 교차 리뷰 number_check 입력 · "절반 · 두 배 · 배 · %" 가 든 본문 문장마다 그 태그의 카드 문장(원문 + 확인된 뜻) */
export function numberPairs(
  blocks: { text: string }[],
  card: QuestionCard,
): { blockIndex: number; sentence: string; facts: { tag: string; original: string; ko: string | null }[] }[] {
  const out: { blockIndex: number; sentence: string; facts: { tag: string; original: string; ko: string | null }[] }[] = [];
  blocks.forEach((b, i) => {
    for (const s of sentencesOf(b.text)) {
      if (!/절반|두\s*배|\d+(\.\d+)?\s*배|배로|%/.test(s.text)) continue;
      const tags = tagsIn(s.text);
      const facts = card.facts
        .filter((f) => tags.includes(f.tag))
        .map((f) => ({ tag: f.tag, original: f.text, ko: f.ko }));
      if (facts.length) out.push({ blockIndex: i, sentence: s.text, facts });
    }
  });
  return out;
}
