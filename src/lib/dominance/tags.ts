// 인라인 원천 태그 [E1] · 편집기(클라이언트)와 서버가 함께 쓴다. LLM 코드와 떼어 둔다.

export const TAG_RE = /\[([A-Z]{1,2}[0-9]{0,2})\]/g;

export function tagsIn(text: string): string[] {
  return [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1]))];
}

/** 블록 글을 문장으로 나눈다. 줄바꿈과 문장 끝 부호에서 자르되, "1.5" 처럼 숫자 사이 점은 자르지 않는다. 끝 태그는 문장에 붙인다. */
export function sentencesOf(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const t = raw.trim();
    if (t) out.push({ text: t, start, end });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      push(i);
      start = i + 1;
      continue;
    }
    if (/[.!?。？]/.test(c) && !/\d/.test(text[i + 1] ?? "")) {
      let end = i + 1;
      // 부호 뒤에 붙은 태그 [E1][M2] 는 이 문장 것이다.
      for (let m = text.slice(end).match(/^\[[A-Z]{1,2}[0-9]{0,2}\]/); m; m = text.slice(end).match(/^\[[A-Z]{1,2}[0-9]{0,2}\]/)) {
        end += m[0].length;
      }
      push(end);
      i = end - 1;
    }
  }
  push(text.length);
  return out;
}
