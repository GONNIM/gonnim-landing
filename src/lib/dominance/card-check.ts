// 카드 수치 대조 (24차 A-6) · 태그 붙은 본문 문장의 숫자가 그 태그의 카드(원문 · 뜻 · 대상 · 연도 · 메모)에 있는가.
//
// 저장을 막지 않는다. 편집기가 어긋난 문장을 붉게 보여 준다.
// 허용 유형: 연도에서 센 햇수(예: 1965년 → "60년"). 근삿말(쯤 · 약 · 남짓 · 여 · 가까이 …)은 그 뜻대로 넓게 본다.
// 23차 실측: "여성은 7,900보 남짓"(카드 7,855보)을 사람도 교차 리뷰도 못 잡았다.

import { sentencesOf, tagsIn } from "./tags";

export type NumToken = { value: number; text: string; approx: "exact" | "about" | "over" | "under"; unitYear: boolean };

const TAG = /\[[A-Z]{1,2}[0-9]{0,2}\]/g;
const UNIT: Record<string, number> = { 억: 1e8, 만: 1e4, 천: 1e3 };

/** 한국어 · 영어 글에서 숫자를 뽑는다. "4만 7천여" → 47,000(over) · "47 471" → 47,471 · "0·60" → 0.6 */
export function extractNumbers(raw: string): NumToken[] {
  const text = raw.replace(TAG, " ");
  const out: NumToken[] = [];
  // 숫자 한 덩어리(+ 한국어 단위). 영어의 "47 471" 처럼 세 자리 공백 묶음도 한 수로 본다.
  const re = /(\d{1,3}(?:[,   ]\d{3})+|\d+)(?:[.·](\d+))?\s*(억|만|천)?/g;
  let m: RegExpExecArray | null;
  let group: { value: number; start: number; end: number; lastUnit: number } | null = null;
  const flush = () => {
    if (!group) return;
    const after = text.slice(group.end, group.end + 8);
    const before = text.slice(Math.max(0, group.start - 3), group.start);
    const word = (w: string) => new RegExp(`^\\s*(?:[가-힣]{1,2}\\s*)?(${w})`);
    const approx: NumToken["approx"] = /^여/.test(after) || word("남짓|넘게|이상|초과").test(after)
      ? "over"
      : word("가까이|미만|이하|근처").test(after)
        ? "under"
        : word("쯤|정도|안팎|가량").test(after) || /약\s*$/.test(before)
          ? "about"
          : "exact";
    out.push({ value: group.value, text: text.slice(group.start, group.end).trim(), approx, unitYear: /^\s*년(?!도)/.test(after) });
    group = null;
  };
  while ((m = re.exec(text))) {
    const base = Number(m[1].replace(/[,   ]/g, "") + (m[2] ? `.${m[2]}` : ""));
    const unit = m[3] ? UNIT[m[3]] : 1;
    const between = group ? text.slice(group.end, m.index) : "";
    // "4만 7천" · "23억 5,700만" 처럼 큰 단위 뒤에 작은 단위가 이어지면 한 수다.
    if (group && group.lastUnit > unit && /^\s*$/.test(between) && group.lastUnit > 1) {
      group.value += base * unit;
      group.end = m.index + m[0].length;
      group.lastUnit = unit;
      continue;
    }
    flush();
    group = { value: base * unit, start: m.index, end: m.index + m[0].trimEnd().length, lastUnit: unit };
  }
  flush();
  return out;
}

function matches(tok: NumToken, card: number[]): boolean {
  return card.some((c) => {
    if (tok.approx === "over") return c >= tok.value && c <= tok.value * 1.12;
    if (tok.approx === "under") return c <= tok.value && c >= tok.value * 0.88;
    const tol = tok.approx === "about" ? 0.05 : 0.006;
    return Math.abs(c - tok.value) <= Math.max(tol * Math.abs(c), 1e-9);
  });
}

export type CardFactLike = { tag: string; text: string; ko: string | null; subject: string | null; year: number | null };

export type NumberMismatch = { blockIndex: number; sentence: string; numbers: string[] };

/**
 * 태그 문장마다 숫자가 그 태그의 카드에 있는지 본다. 없으면 어긋남.
 * 허용: 연도에서 센 햇수 — "N년" 이고 N 이 (카드 연도 또는 올해) − (카드 연도) 와 1 이내로 같을 때.
 */
export function cardNumberMismatches(
  blocks: { text: string }[],
  facts: CardFactLike[],
  memos: { tag: string; memo: string | null }[],
  vLine: string | null,
): NumberMismatch[] {
  const thisYear = new Date().getFullYear();
  const out: NumberMismatch[] = [];
  blocks.forEach((b, blockIndex) => {
    for (const s of sentencesOf(b.text)) {
      const tags = tagsIn(s.text);
      if (tags.length === 0) continue;
      const pool: number[] = [];
      const years: number[] = [];
      for (const f of facts.filter((x) => tags.includes(x.tag))) {
        for (const t of [f.text, f.ko ?? "", f.subject ?? ""]) pool.push(...extractNumbers(t).map((n) => n.value));
        if (f.year) {
          pool.push(f.year);
          years.push(f.year);
        }
      }
      for (const m of memos.filter((x) => tags.includes(x.tag))) pool.push(...extractNumbers(m.memo ?? "").map((n) => n.value));
      if (tags.includes("V") && vLine) pool.push(...extractNumbers(vLine).map((n) => n.value));
      pool.forEach((v) => v >= 1900 && v <= thisYear + 1 && years.push(v));

      const bad = extractNumbers(s.text).filter((tok) => {
        if (matches(tok, pool)) return false;
        // 허용: 연도에서 센 햇수
        if (tok.unitYear && tok.value < 200) {
          const ys = [...new Set(years)];
          if (ys.some((a) => [thisYear, ...ys].some((b2) => Math.abs(b2 - a - tok.value) <= 1))) return false;
        }
        return true;
      });
      if (bad.length) out.push({ blockIndex, sentence: s.text, numbers: bad.map((t) => t.text) });
    }
  });
  return out;
}
