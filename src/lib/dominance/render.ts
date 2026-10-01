// 레터 한 편을 세 채널이 쓰는 두 형태로 만든다.
//
// 웹과 앱은 같은 JSON 을 읽고, 이메일만 HTML 이 필요하다.
// 원본이 하나여야 세 채널이 갈라지지 않으므로 여기 말고 다른 곳에서 모양을 만들지 않는다.

import type { BlockKind, LetterBlock } from "./types";
import type { LoadedSource } from "./letters";
import type { ReactionLinks } from "./reactions";
import { SENDER_LINE } from "@/lib/sangsik/site";

export type LetterPayload = {
  slug: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  blocks: { kind: string; label: string; text: string }[];
  /** number 는 본문 등장 순서 번호다. 본문에 인용되지 않은 원천은 null 이고 목록 끝에 온다. */
  sources: { number: number | null; label: string; title: string; url: string; license: string }[];
  corrections: { description: string; resolution: string | null; at: string }[];
  /** 반응 · 투표 링크를 만들 때 쓴다(26차 C). 공개해도 되는 값만 둔다. 옛 JSON 에는 없다. */
  letterId?: string;
  /** 운영자가 고른 다음 질문 후보 3개 */
  votes?: { id: string; question: string }[];
};

// 인라인 원천 태그 [E1] · [V] (D36). 형식은 ds_letter_sources.tag 의 CHECK 와 같다.
const TAG = /\[([A-Z]{1,2}[0-9]{0,2})\]/g;

/** 본문에 나온 태그를 등장 순서대로 모은다. 같은 태그는 한 번만 센다. */
export function tagsInOrder(blocks: { text: string }[]): string[] {
  const seen: string[] = [];
  for (const b of blocks) {
    for (const m of b.text.matchAll(TAG)) {
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

/** 원천 목록에 짝이 없는 본문 태그. 리뷰의 sources 점검이 이것으로 막는다. */
export function unknownTags(blocks: { text: string }[], sourceTags: (string | null)[]): string[] {
  const known = new Set(sourceTags.filter((t): t is string => Boolean(t)));
  return tagsInOrder(blocks).filter((t) => !known.has(t));
}

// 독자가 보는 블록 이름표. 콘솔의 BLOCK_LABEL(편집자용)과 따로 둔다.
// 훅과 은유는 이름표 없이 본문만 보인다 — "훅" 은 만드는 쪽의 말이다.
export const READER_BLOCK_LABEL: Record<BlockKind, string> = {
  summary: "3줄 요약",
  hook: "",
  research: "연구",
  mechanism: "왜 그런가",
  industry: "산업",
  practice: "내 몸",
  metaphor: "",
};

const DISCLAIMER =
  "이 글은 연구 결과를 소개합니다. 의학적 조언이 아니며 진단이나 치료를 대신할 수 없습니다.";

export function toPayload(input: {
  slug: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  blocks: LetterBlock[];
  sources: LoadedSource[];
  corrections?: { description: string; resolution: string | null; at: string }[];
  letterId?: string;
  votes?: { id: string; question: string }[];
}): LetterPayload {
  const blocks = input.blocks.filter((b) => b.text.trim());

  // 번호는 본문 등장 순서다. 원천 목록에 없는 태그는 번호를 받지 않고 본문에 그대로 남는다.
  const byTag = new Map(
    input.sources.filter((s) => s.tag).map((s) => [s.tag as string, s]),
  );
  // 한 문장 요약이 본문보다 먼저 보이므로 번호도 요약부터 센다.
  const numberOf = new Map<string, number>();
  for (const tag of tagsInOrder([{ text: input.summary ?? "" }, ...blocks])) {
    if (byTag.has(tag)) numberOf.set(tag, numberOf.size + 1);
  }

  const toEntry = (s: LoadedSource, number: number | null) => ({
    number,
    label: s.label,
    title: s.title,
    url: s.url,
    license: s.attribution ?? s.licenseLabel,
  });

  const numbered = [...numberOf.entries()].map(([tag, n]) => toEntry(byTag.get(tag)!, n));
  const rest = input.sources
    .filter((s) => !s.tag || !numberOf.has(s.tag))
    .map((s) => toEntry(s, null));

  const renumber = (text: string) =>
    text.replace(TAG, (whole, tag: string) =>
      numberOf.has(tag) ? `[${numberOf.get(tag)}]` : whole,
    );

  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary ? renumber(input.summary) : input.summary,
    publishedAt: input.publishedAt,
    // 웹 · 앱 · 이메일이 같은 본문을 쓴다. 태그를 [번호] 로 바꿔 둔다.
    blocks: blocks.map((b) => ({
      kind: b.kind,
      label: READER_BLOCK_LABEL[b.kind],
      text: renumber(b.text),
    })),
    sources: [...numbered, ...rest],
    corrections: input.corrections ?? [],
    ...(input.letterId ? { letterId: input.letterId } : {}),
    ...(input.votes?.length ? { votes: input.votes.slice(0, 3) } : {}),
  };
}

/**
 * 반응 · 투표 블록(26차 C-5). 메일과 웹 페이지가 같은 모양을 쓴다.
 * 좁은 화면(320px)에서도 버튼이 줄을 바꿔 들어가게 inline-block 과 여백만 쓴다.
 */
function reactionBlock(r: ReactionLinks): string {
  const btn = (l: { label: string; url: string }) =>
    `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 14px;border:1px solid #d1d5db;border-radius:18px;font-size:14px;line-height:1.3;color:#1f2328;text-decoration:none">${escapeHtml(l.label)}</a>`;
  const votes = r.votes.length
    ? `<p style="margin:12px 0 8px;font-size:13px;font-weight:600;color:#374151">다음에 무엇을 다룰까요</p>
       ${r.votes
         .map(
           (v) =>
             `<a href="${escapeHtml(v.url)}" style="display:block;margin:0 0 8px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;line-height:1.5;color:#1f2328;text-decoration:none;word-break:keep-all;overflow-wrap:anywhere">${escapeHtml(v.label)}</a>`,
         )
         .join("")}`
    : "";
  return `<div style="margin:0 0 28px;padding:16px;border-radius:10px;background:#f9fafb">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151">이 글은 어땠나요</p>
      <div>${r.reacts.map(btn).join("")}</div>
      ${votes}
      <p style="margin:8px 0 0;font-size:11px;line-height:1.5;color:#9ca3af">누른 사람이 아니라 글마다 숫자만 셉니다.</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** [번호] 를 원천 링크가 걸린 위첨자로 바꾼다. 목록에 없는 번호는 건드리지 않는다. */
function superscripts(escaped: string, urlOf: Map<number, string>): string {
  return escaped.replace(/\[(\d{1,3})\]/g, (whole, n: string) => {
    const url = urlOf.get(Number(n));
    return url
      ? `<sup style="font-size:11px;line-height:0"><a href="${escapeHtml(url)}" style="color:#1d4ed8;text-decoration:none">${n}</a></sup>`
      : whole;
  });
}

function paragraphs(text: string, urlOf: Map<number, string>): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:16px;line-height:1.75;color:#1f2328">${superscripts(escapeHtml(line), urlOf)}</p>`,
    )
    .join("");
}

function sourceLine(s: LetterPayload["sources"][number]): string {
  return [s.label, s.license].filter(Boolean).join(" · ");
}

/**
 * 이메일 HTML. 메일 클라이언트는 외부 CSS 와 대부분의 최신 문법을 버리므로
 * 표 대신 div 를 쓰고 스타일을 각 요소에 직접 붙인다.
 */
export function toEmailHtml(
  payload: LetterPayload,
  /** webUrl 이 없으면 "웹에서 보기" 를 그리지 않는다(웹 페이지 자신이 이 틀을 쓸 때). */
  options: { webUrl?: string; unsubscribeUrl: string; reactions?: ReactionLinks; tail?: string },
): string {
  const urlOf = new Map(
    payload.sources.filter((s) => s.number !== null).map((s) => [s.number as number, s.url]),
  );

  const blocks = payload.blocks
    .map(
      (b) => `
      <div style="margin:0 0 28px">
        ${b.label ? `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;color:#6b7280;text-transform:uppercase">${escapeHtml(b.label)}</p>` : ""}
        ${paragraphs(b.text, urlOf)}
      </div>`,
    )
    .join("");

  const sources = payload.sources
    .map(
      (s) =>
        `<li style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#4b5563;list-style:none">
           ${s.number !== null ? `<span style="color:#6b7280">${s.number}.</span> ` : ""}<a href="${escapeHtml(s.url)}" style="color:#1d4ed8;word-break:break-word">${escapeHtml(s.title)}</a>
           · ${escapeHtml(sourceLine(s))}
         </li>`,
    )
    .join("");

  const corrections = payload.corrections.length
    ? `<div style="margin:0 0 24px;padding:12px 14px;border-left:3px solid #d97706;background:#fffbeb">
         <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e">정정</p>
         ${payload.corrections
           .map(
             (c) =>
               `<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#92400e">${escapeHtml(c.description)}${c.resolution ? ` → ${escapeHtml(c.resolution)}` : ""}</p>`,
           )
           .join("")}
       </div>`
    : "";

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(payload.title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9">
  <div style="max-width:620px;margin:0 auto;padding:32px 20px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">지배상식</p>
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.4;color:#111827">${escapeHtml(payload.title)}</h1>
    ${payload.summary ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5563">${superscripts(escapeHtml(payload.summary), urlOf)}</p>` : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px">
    ${corrections}
    ${blocks}
    ${options.reactions ? reactionBlock(options.reactions) : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151">원천</p>
    <ul style="margin:0 0 20px;padding-left:0">${sources}</ul>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(DISCLAIMER)}</p>
    <p style="margin:0 0 6px;font-size:12px;color:#9ca3af">${escapeHtml(SENDER_LINE)}</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">
      ${options.webUrl ? `<a href="${escapeHtml(options.webUrl)}" style="color:#6b7280">웹에서 보기</a>
      · ` : ""}<a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6b7280">수신거부</a>
    </p>
  </div>${options.tail ?? ""}
</body></html>`;
}

export function toPlainText(payload: LetterPayload, unsubscribeUrl?: string, reactions?: ReactionLinks): string {
  const blocks = payload.blocks
    .map((b) => (b.label ? `[${b.label}]\n${b.text}` : b.text))
    .join("\n\n");
  const sources = payload.sources
    .map((s) => `${s.number !== null ? `[${s.number}]` : "-"} ${s.title} (${sourceLine(s)}) ${s.url}`)
    .join("\n");

  return [
    payload.title,
    payload.summary ?? "",
    "",
    blocks,
    "",
    ...(reactions
      ? [
          "이 글은 어땠나요",
          ...reactions.reacts.map((r) => `${r.label}: ${r.url}`),
          ...(reactions.votes.length ? ["", "다음에 무엇을 다룰까요", ...reactions.votes.map((v) => `${v.label}: ${v.url}`)] : []),
          "",
        ]
      : []),
    "원천",
    sources,
    "",
    DISCLAIMER,
    "",
    SENDER_LINE,
    ...(unsubscribeUrl ? [`수신거부: ${unsubscribeUrl}`] : []),
  ].join("\n");
}

export function readingMinutes(blocks: LetterBlock[]): number {
  const chars = blocks.reduce((n, b) => n + b.text.length, 0);
  // 한국어 묵독 속도를 분당 500자로 본다.
  return Math.max(1, Math.round(chars / 500));
}

export function charCount(blocks: LetterBlock[]): number {
  return blocks.reduce((n, b) => n + b.text.length, 0);
}
