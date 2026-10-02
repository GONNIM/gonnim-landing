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
  /** 호수 · 발행된 글 순번(41차). 테스트 발송과 옛 JSON 에는 없다. */
  issue?: number;
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
  // 41차 C · 새 틀의 이름표
  research: "연구가 확인한 것",
  mechanism: "왜 그런가",
  industry: "산업은 어디로",
  practice: "내 몸에 적용하면",
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
  issue?: number;
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
    ...(input.issue ? { issue: input.issue } : {}),
  };
}

// ── 41차 C · 메일 · 웹 새 틀 ─────────────────────────────────────────────
// 메일 클라이언트(특히 Gmail · Outlook)는 외부 CSS 와 웹 글꼴을 버린다. 표(role=presentation)로 틀을 잡고
// 스타일은 요소마다 붙인다. 밝은 모드로 고정한다(color-scheme). 바뀌는 것은 모양뿐이고 글 · 링크 · 고지는 그대로다.

const INK = "#17232a";
const SUB = "#5b6b73";
const BRAND = "#0f6e73";
const LINE = "#e3e8ea";
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕','Noto Sans KR','Noto Sans CJK KR','Nanum Gothic',-apple-system,sans-serif";
const KEEP = "word-break:keep-all;overflow-wrap:anywhere";

/** 반응 · 투표 상자(26차 C-5 · 41차 새 틀). 단추는 inline-block 이라 좁은 화면에서 줄을 바꿔 들어간다. */
function reactionBlock(r: ReactionLinks): string {
  const btn = (l: { label: string; url: string }) =>
    `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 6px 8px 0;padding:10px 14px;border:1.5px solid ${BRAND};border-radius:10px;font-size:14px;font-weight:600;line-height:1.3;color:${BRAND};text-decoration:none">${escapeHtml(l.label)}</a>`;
  const votes = r.votes.length
    ? `<p style="margin:16px 0 8px;font-size:14.5px;font-weight:700;color:${INK}">다음 글, 무엇이 궁금하세요</p>
       ${r.votes
         .map(
           (v, i) =>
             `<a href="${escapeHtml(v.url)}" style="display:block;margin:0 0 8px;padding:11px 14px;border:1px solid ${LINE};border-radius:10px;font-size:14px;line-height:1.5;color:${INK};text-decoration:none;${KEEP}"><span style="color:${BRAND};font-weight:700">${i + 1}</span>&nbsp;&nbsp;${escapeHtml(v.label)}</a>`,
         )
         .join("")}`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;border:1px solid ${LINE};border-radius:12px;border-collapse:separate"><tr><td style="padding:18px 16px">
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:${INK}">이 글, 어땠나요</p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${SUB}">누른 사람이 아니라 글마다 숫자만 셉니다.</p>
      <div>${r.reacts.map(btn).join("")}</div>
      ${votes}
    </td></tr></table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** [번호] 를 원천 링크가 걸린 위첨자로 바꾼다. 붙어 있는 번호([1][2])는 위첨자 하나에 「1,2」로 묶는다. */
function superscripts(escaped: string, urlOf: Map<number, string>): string {
  return escaped.replace(/(?:\[\d{1,3}\])+/g, (run) => {
    const nums = [...run.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
    if (!nums.every((n) => urlOf.has(n))) return run;
    const links = nums
      .map((n) => `<a href="${escapeHtml(urlOf.get(n)!)}" style="color:${BRAND};text-decoration:none;font-weight:700">${n}</a>`)
      .join(",");
    return `<sup style="font-size:10px;line-height:0;color:${BRAND};font-weight:700">${links}</sup>`;
  });
}

function paragraphs(text: string, urlOf: Map<number, string>, size: number, gap = 14, lh = 1.8): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 ${gap}px;font-size:${size}px;line-height:${lh};letter-spacing:-0.3px;color:${INK};${KEEP}">${superscripts(escapeHtml(line), urlOf)}</p>`,
    )
    .join("");
}

function sourceLine(s: LetterPayload["sources"][number]): string {
  return [s.label, s.license].filter(Boolean).join(" · ");
}

/** 2026-10-02 → 2026년 10월 2일 (KST) */
function koreanDate(iso: string | null): string {
  const d = new Date(new Date(iso ?? Date.now()).getTime() + 9 * 3600e3);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 미리보기 글(프리헤더) · 한 문장 요약에서 [번호] 를 뺀 글 */
function preheader(summary: string | null): string {
  const t = (summary ?? "").replace(/\[\d{1,3}\]/g, "").replace(/\s+/g, " ").trim();
  return t
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(t)}</div>`
    : "";
}

function blockHtml(b: LetterPayload["blocks"][number], urlOf: Map<number, string>, body: number): string {
  if (b.kind === "summary") {
    const lines = b.text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const rows = lines
      .map(
        (l, i) =>
          `<tr><td valign="top" style="width:22px;padding:0 0 8px;font-size:13px;line-height:1.9;font-weight:700;color:${BRAND}">${i + 1}</td><td valign="top" style="padding:0 0 8px;font-size:14.5px;line-height:1.7;letter-spacing:-0.3px;color:${INK};${KEEP}">${superscripts(escapeHtml(l), urlOf)}</td></tr>`,
      )
      .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px;background:#eef6f6;border-radius:10px;border-collapse:separate"><tr><td style="padding:16px 16px 8px">
        <p style="margin:0 0 10px;font-size:12.5px;font-weight:700;color:${BRAND}">먼저 세 줄</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr></table>`;
  }
  if (b.kind === "hook") return `<div style="margin:0 0 30px">${paragraphs(b.text, urlOf, 16)}</div>`;
  if (b.kind === "metaphor")
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px;background:#fafbfb;border-left:3px solid ${BRAND}"><tr><td style="padding:14px 16px 2px">${paragraphs(b.text, urlOf, 16, 12, 1.75)}</td></tr></table>`;
  const label = b.label
    ? `<div style="width:18px;height:2px;background:${BRAND};margin:0 0 8px;font-size:0;line-height:0">&nbsp;</div>
       <p style="margin:0 0 10px;font-size:12.5px;font-weight:700;color:${BRAND}">${escapeHtml(b.label)}</p>`
    : "";
  return `<div style="margin:0 0 30px">${label}${paragraphs(b.text, urlOf, body)}</div>`;
}

/**
 * 이메일 HTML(41차 새 틀). 웹 페이지(/sangsik/l/[slug])도 같은 함수를 쓴다(42차 · 메일 본문 15px · variant "web" 은 16px).
 */
export function toEmailHtml(
  payload: LetterPayload,
  /** webUrl 이 없으면 "웹에서 보기" 를 그리지 않는다(웹 페이지 자신이 이 틀을 쓸 때). test 이면 호수 자리에 「테스트」. */
  options: {
    webUrl?: string;
    unsubscribeUrl: string;
    reactions?: ReactionLinks;
    tail?: string;
    variant?: "email" | "web";
    test?: boolean;
  },
): string {
  const body = options.variant === "web" ? 16 : 15; // 42차 · 본문 15px 기준(웹 16px)
  const urlOf = new Map(
    payload.sources.filter((s) => s.number !== null).map((s) => [s.number as number, s.url]),
  );
  const issue = payload.issue ? `${payload.issue}호` : options.test ? "테스트" : "";
  const dateLine = [koreanDate(payload.publishedAt), issue].filter(Boolean).join(" · ");

  const blocks = payload.blocks.map((b) => blockHtml(b, urlOf, body)).join("");

  const sources = payload.sources
    .map(
      (s) =>
        `<tr><td valign="top" style="width:24px;padding:0 0 10px;font-size:12.5px;line-height:1.55;font-weight:700;color:${BRAND}">${s.number ?? "·"}</td>
           <td valign="top" style="padding:0 0 10px;font-size:12.5px;line-height:1.55;color:${SUB};${KEEP}">
             <a href="${escapeHtml(s.url)}" style="color:${INK};text-decoration:none;border-bottom:1px solid #b8c4c9;word-break:break-word">${escapeHtml(s.title)}</a><br>
             <span style="font-size:11.5px;color:${SUB}">${escapeHtml(sourceLine(s))}</span>
           </td></tr>`,
    )
    .join("");

  const corrections = payload.corrections.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;background:#fffbeb;border-left:3px solid #d97706"><tr><td style="padding:12px 14px">
         <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e">정정</p>
         ${payload.corrections
           .map(
             (c) =>
               `<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#92400e;${KEEP}">${escapeHtml(c.description)}${c.resolution ? ` → ${escapeHtml(c.resolution)}` : ""}</p>`,
           )
           .join("")}
       </td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(payload.title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f3;color-scheme:light only">
${preheader(payload.summary)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f3"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;border-collapse:separate;font-family:${FONT};color:${INK}"><tr><td style="padding:24px 22px 26px">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:2px solid ${BRAND}"><tr>
    <td style="padding:0 0 10px;font-size:15px;font-weight:700;color:${BRAND}">지배상식</td>
    <td align="right" style="padding:0 0 10px;font-size:12.5px;color:${SUB}">${escapeHtml(dateLine)}</td>
  </tr></table>

  <h1 style="margin:22px 0 14px;font-size:24px;line-height:1.35;letter-spacing:-0.02em;font-weight:800;color:${INK};${KEEP}">${escapeHtml(payload.title)}</h1>
  ${payload.summary ? `<p style="margin:0 0 28px;padding:2px 0 2px 12px;border-left:3px solid ${BRAND};font-size:15px;line-height:1.7;letter-spacing:-0.3px;color:${SUB};${KEEP}">${superscripts(escapeHtml(payload.summary), urlOf)}</p>` : ""}
  ${corrections}
  ${blocks}
  ${options.reactions ? reactionBlock(options.reactions) : ""}

  <p style="margin:6px 0 4px;font-size:14px;font-weight:700;color:${INK}">이 글이 기댄 원천 ${payload.sources.length}개</p>
  <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${SUB}">본문의 작은 번호가 아래 번호와 같습니다. 제목을 누르면 원문이 열립니다.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${sources}</table>

  <p style="margin:0 0 14px;padding:12px 0 0;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${SUB};${KEEP}">${escapeHtml(DISCLAIMER)}</p>
  <p style="margin:0 0 6px;font-size:12px;line-height:1.8;color:#8a989e">${escapeHtml(SENDER_LINE)}</p>
  <p style="margin:0;font-size:12px;line-height:1.8;color:#8a989e">
    ${options.webUrl ? `<a href="${escapeHtml(options.webUrl)}" style="color:${SUB}">웹에서 보기</a>
    · ` : ""}<a href="${escapeHtml(options.unsubscribeUrl)}" style="color:${SUB}">수신거부</a>
  </p>

</td></tr></table>
</td></tr></table>${options.tail ?? ""}
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
