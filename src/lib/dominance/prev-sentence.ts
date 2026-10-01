// 33차 F · 뜻 확인 화면의 "앞 문장" · 원문 문장 바로 앞의 초록 문장 하나를 찾는다.
//
// LLM 을 부르지 않는다. 원문이 지시어(these cases 등)로 앞 문장을 가리킬 때 운영자가 뜻이 맞게
// 풀렸는지 보게 하려는 것이다(런북 13). 32차 C 에서 앞 문장을 뜻 만들기에 넣어 보니 효과가 없었다.
//
// 구조화된 초록은 "Background · Results · Conclusion" 같은 소제목이 문장 사이에 끼어 있다.
// 바로 앞 조각이 소제목뿐이면 그보다 더 앞의 문장을 쓴다. 문장 앞에 붙은 소제목은 떼어 낸다.

const HEADINGS = [
  "background",
  "backgrounds",
  "introduction",
  "context",
  "importance",
  "objective",
  "objectives",
  "aim",
  "aims",
  "purpose",
  "design",
  "setting",
  "settings",
  "participants",
  "methods",
  "method",
  "materials and methods",
  "main outcome measures",
  "measurements",
  "results",
  "findings",
  "discussion",
  "conclusion",
  "conclusions",
  "interpretation",
  "statement of significance",
  "significance",
  "funding",
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function isHeading(s: string): boolean {
  return HEADINGS.includes(s.replace(/[:.]\s*$/, "").trim().toLowerCase());
}

/** 문장 앞에 붙은 소제목을 뗀다("Results Compared to …" → "Compared to …") */
function dropLeadingHeading(s: string): string {
  const lower = s.toLowerCase();
  const h = [...HEADINGS].sort((a, b) => b.length - a.length).find((x) => lower.startsWith(`${x} `) || lower.startsWith(`${x}: `));
  return h ? s.slice(h.length).replace(/^[:\s]+/, "") : s;
}

/**
 * 초록에서 text 바로 앞 문장. 찾을 수 없으면 null(본문 문장 · 초록 없음),
 * text 가 초록 첫 문장이면 "(초록 첫 문장)".
 */
export function prevSentence(abstract: string | null | undefined, text: string): string | null {
  if (!abstract) return null;
  const S = norm(abstract);
  const i = S.indexOf(norm(text));
  if (i < 0) return null;
  const parts = S.slice(0, i)
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((p) => p.trim())
    .filter(Boolean);
  while (parts.length) {
    let last = parts.pop()!;
    // "… 끝 문장. Background" 처럼 소제목이 다음 문장 앞에 붙어 남은 경우 → 소제목을 떼고 본다
    const tailHeading = HEADINGS.find((h) => last.toLowerCase().endsWith(` ${h}`) || last.toLowerCase() === h);
    if (tailHeading && last.toLowerCase() !== tailHeading) last = last.slice(0, last.length - tailHeading.length).trim();
    if (!last || isHeading(last)) continue;
    const cleaned = dropLeadingHeading(last);
    if (cleaned && !isHeading(cleaned)) return cleaned;
  }
  return "(초록 첫 문장)";
}
