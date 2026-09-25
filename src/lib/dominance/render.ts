// 레터 한 편을 세 채널이 쓰는 두 형태로 만든다.
//
// 웹과 앱은 같은 JSON 을 읽고, 이메일만 HTML 이 필요하다.
// 원본이 하나여야 세 채널이 갈라지지 않으므로 여기 말고 다른 곳에서 모양을 만들지 않는다.

import { BLOCK_LABEL, type LetterBlock } from "./types";
import type { LoadedSource } from "./letters";

export type LetterPayload = {
  slug: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  blocks: { kind: string; label: string; text: string }[];
  sources: { label: string; title: string; url: string; license: string }[];
  corrections: { description: string; resolution: string | null; at: string }[];
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
}): LetterPayload {
  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    publishedAt: input.publishedAt,
    blocks: input.blocks
      .filter((b) => b.text.trim())
      .map((b) => ({ kind: b.kind, label: BLOCK_LABEL[b.kind], text: b.text })),
    sources: input.sources.map((s) => ({
      label: s.label,
      title: s.title,
      url: s.url,
      license: s.attribution ?? s.licenseLabel,
    })),
    corrections: input.corrections ?? [],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:16px;line-height:1.75;color:#1f2328">${escapeHtml(line)}</p>`,
    )
    .join("");
}

/**
 * 이메일 HTML. 메일 클라이언트는 외부 CSS 와 대부분의 최신 문법을 버리므로
 * 표 대신 div 를 쓰고 스타일을 각 요소에 직접 붙인다.
 */
export function toEmailHtml(
  payload: LetterPayload,
  options: { webUrl: string; unsubscribeUrl: string },
): string {
  const blocks = payload.blocks
    .map(
      (b) => `
      <div style="margin:0 0 28px">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;color:#6b7280;text-transform:uppercase">${escapeHtml(b.label)}</p>
        ${paragraphs(b.text)}
      </div>`,
    )
    .join("");

  const sources = payload.sources
    .map(
      (s) =>
        `<li style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#4b5563">
           <a href="${escapeHtml(s.url)}" style="color:#1d4ed8">${escapeHtml(s.title)}</a>
           · ${escapeHtml(s.label)} · ${escapeHtml(s.license)}
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
    ${payload.summary ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5563">${escapeHtml(payload.summary)}</p>` : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px">
    ${corrections}
    ${blocks}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151">원천</p>
    <ul style="margin:0 0 20px;padding-left:18px">${sources}</ul>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(DISCLAIMER)}</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">
      <a href="${escapeHtml(options.webUrl)}" style="color:#6b7280">웹에서 보기</a>
      ·
      <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6b7280">수신거부</a>
    </p>
  </div>
</body></html>`;
}

export function toPlainText(payload: LetterPayload): string {
  const blocks = payload.blocks
    .map((b) => `[${b.label}]\n${b.text}`)
    .join("\n\n");
  const sources = payload.sources
    .map((s) => `- ${s.title} (${s.label} · ${s.license}) ${s.url}`)
    .join("\n");

  return [
    payload.title,
    payload.summary ?? "",
    "",
    blocks,
    "",
    "원천",
    sources,
    "",
    DISCLAIMER,
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
