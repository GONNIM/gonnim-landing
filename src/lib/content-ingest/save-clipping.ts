// Obsidian Clippings/summaries/ 파일 저장
//
// Frontmatter v2 · type: reference · provenance: {source, url, source_created, ingested_at} · confidence: medium
// Clippings/ 폴더는 /lint 검사 예외 (orphan / frontmatter · CLAUDE.md §2.1)

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ExtractedContent,
  SavedClipping,
  SummarizeResult,
} from "./types";

const DEFAULT_CLIPPINGS_DIR =
  "/Users/gonnim/GON-LLM-Wiki/Clippings/summaries";

export type SaveOptions = {
  clippingsDir?: string;
  now?: Date;
};

export type RenderedClipping = {
  filename: string;
  slug: string;
  markdown: string;
  createdAt: string;
};

// 파일 쓰기 없이 markdown + 파일명만 생성 (Vercel 다운로드 fallback 용)
export function renderClipping(
  content: ExtractedContent,
  summary: SummarizeResult,
  options: Pick<SaveOptions, "now"> = {},
): RenderedClipping {
  const now = options.now ?? new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);
  const slug = buildSlug(content, summary);
  const filename = `${dateStr}-${timeStr}-${slug}.md`;
  const markdown = renderMarkdown(content, summary, now);
  return { filename, slug, markdown, createdAt: now.toISOString() };
}

export async function saveClipping(
  content: ExtractedContent,
  summary: SummarizeResult,
  options: SaveOptions = {},
): Promise<SavedClipping> {
  const dir = options.clippingsDir || process.env.INGEST_CLIPPINGS_DIR || DEFAULT_CLIPPINGS_DIR;
  const rendered = renderClipping(content, summary, { now: options.now });

  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, rendered.filename);
  await fs.writeFile(filePath, rendered.markdown, "utf8");

  return {
    path: filePath,
    filename: rendered.filename,
    slug: rendered.slug,
    createdAt: rendered.createdAt,
  };
}

function renderMarkdown(
  c: ExtractedContent,
  s: SummarizeResult,
  now: Date,
): string {
  const title = c.title || s.summary[0] || "무제";
  const isoNow = formatDateTime(now);
  const sourceCreated = c.published ? c.published.slice(0, 10) : formatDate(now);
  const tagsLine = renderTags(["ingest", s.domain, ...s.tags]);
  const relatedItems = ["[[../_INDEX]]"];

  const frontmatter = [
    "---",
    `title: ${escapeYaml(title)}`,
    "type: reference",
    `domain: [${s.domain}]`,
    "status: active",
    "provenance:",
    `  source: ${c.source}`,
    ...(c.url ? [`  url: ${c.url}`] : []),
    `  source_created: "${sourceCreated}"`,
    `  ingested_at: "${isoNow}"`,
    "confidence: medium",
    `tags: [${tagsLine}]`,
    "related:",
    ...relatedItems.map((r) => `  - ${r}`),
    "---",
    "",
  ].join("\n");

  const parts: string[] = [];
  parts.push(`# ${title}`);
  parts.push("");

  if (c.url || c.author) {
    const metaLines: string[] = [];
    if (c.url) metaLines.push(`> **원본**: <${c.url}>`);
    if (c.author) metaLines.push(`> **작성자**: ${c.author}`);
    if (c.published) metaLines.push(`> **발행**: ${c.published}`);
    metaLines.push(`> **인입**: ${isoNow} · z.ai GLM-5.2`);
    parts.push(metaLines.join("  \n"));
    parts.push("");
  }

  parts.push("## 요약");
  parts.push("");
  for (const line of s.summary) parts.push(`- ${line}`);
  parts.push("");

  parts.push("## 인사이트");
  parts.push("");
  for (const line of s.insights) parts.push(`- ${line}`);
  parts.push("");

  parts.push("## 태그·도메인");
  parts.push("");
  parts.push(`- 도메인: \`${s.domain}\``);
  parts.push(`- 태그: ${s.tags.map((t) => `\`${t}\``).join(" · ")}`);
  parts.push("");

  parts.push("## 원문 발췌 (요약 검증용)");
  parts.push("");
  parts.push("```");
  parts.push(truncate(c.text, 1500));
  parts.push("```");
  parts.push("");

  return frontmatter + parts.join("\n");
}

function renderTags(tags: string[]): string {
  const uniq = Array.from(new Set(tags.filter((t) => t && t !== "misc")));
  return uniq.map((t) => sanitizeTag(t)).filter((x) => x.length > 0).join(", ");
}

function sanitizeTag(t: string): string {
  return t.replace(/[^\w\-가-힣]/g, "").slice(0, 40);
}

function buildSlug(c: ExtractedContent, s: SummarizeResult): string {
  const seed = (c.title || s.summary[0] || "note")
    .toLowerCase()
    .replace(/[^\w가-힣\s\-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return seed || "note";
}

function escapeYaml(s: string): string {
  const t = s.replace(/"/g, '\\"');
  return `"${t}"`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n... (원문 " + s.length + "자 · " + n + "자로 발췌)";
}

// Vercel 서버는 UTC · 사용자 vault 는 KST 정합 필요 → Intl 로 Asia/Seoul 강제
const KST_PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function kstParts(d: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const parts = KST_PARTS_FMT.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // Intl 에서 hour "24" 로 나오는 경우 있음 (자정) → "00" 정규화
  const hourRaw = get("hour");
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function formatDate(d: Date): string {
  const p = kstParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}
function formatTime(d: Date): string {
  const p = kstParts(d);
  return `${p.hour}${p.minute}${p.second}`;
}
function formatDateTime(d: Date): string {
  const p = kstParts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
