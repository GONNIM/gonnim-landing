// URL·텍스트 → ExtractedContent 정규화
//
// URL: HTTP fetch → cheerio 로 script/style/nav 제거 → 본문 텍스트만 추출
// 텍스트: 원문 그대로 (source=personal)
// TikTok URL: oEmbed API 우선 (JS 렌더링 페이지 우회)
//
// 실패 케이스는 명확한 에러 던짐 (fallback 없음).

import * as cheerio from "cheerio";
import { fetchTikTokMeta } from "./tiktok-api";
import { transcribeFromUrl } from "./transcript";
import type { ExtractedContent } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 40_000;

export async function extractFromUrl(url: string): Promise<ExtractedContent> {
  const parsed = new URL(url);
  if (parsed.hostname.endsWith("tiktok.com")) {
    return extractFromTikTok(parsed.toString());
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,en-US;q=0.7,en;q=0.3",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`fetch failed · ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);

  // 노이즈 제거
  $("script, style, noscript, iframe, nav, header, footer, aside, .ads, .sidebar").remove();

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text().trim() ||
    null;
  const author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    null;
  const published =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="pubdate"]').attr("content") ||
    null;

  // 본문 우선순위: article > main > body
  let container = $("article").first();
  if (container.length === 0) container = $("main").first();
  if (container.length === 0) container = $("body").first();

  const rawText = container.text().replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const text = rawText.slice(0, MAX_TEXT_CHARS);

  if (!text) {
    throw new Error("본문 추출 실패 · 페이지 구조가 특수하거나 JS 렌더링 필요");
  }

  return {
    source: "web",
    url: parsed.toString(),
    title: title ? title.trim() : null,
    author: author ? author.trim() : null,
    published: published ? published.trim() : null,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

// TikTok URL → tikwm.com (메타 + mp3 URL) + Groq Whisper STT (자막 없을 시)
// 자막 있으면 STT 스킵 (비용·시간 절감)
async function extractFromTikTok(url: string): Promise<ExtractedContent> {
  const meta = await fetchTikTokMeta(url);

  // 우선순위: content_desc (TikTok 자체 자막) > mp3 → Groq STT
  let transcript = "";
  let transcriptSource: "caption" | "stt" | "none" = "none";

  if (meta.captions.length > 0) {
    transcript = meta.captions.join("\n").trim();
    transcriptSource = "caption";
  } else if (meta.audioUrl) {
    const stt = await transcribeFromUrl(meta.audioUrl, { language: "ko" });
    transcript = stt.text;
    transcriptSource = "stt";
  }

  const header: string[] = [];
  if (meta.title) header.push(`제목: ${meta.title}`);
  if (meta.authorNickname) {
    const handle = meta.authorUniqueId ? ` (@${meta.authorUniqueId})` : "";
    header.push(`작성자: ${meta.authorNickname}${handle}`);
  }
  if (meta.durationSec) header.push(`영상 길이: ${meta.durationSec}초`);
  if (meta.playCount != null) header.push(`조회수: ${meta.playCount.toLocaleString()}`);
  header.push(`스크립트 출처: ${labelSource(transcriptSource)}`);

  const bodyParts: string[] = [];
  if (transcript) {
    bodyParts.push("[스크립트]");
    bodyParts.push(transcript);
  } else {
    bodyParts.push("[스크립트 없음 · 자막·오디오 모두 확보 실패]");
  }

  const text = `${header.join("\n")}\n\n${bodyParts.join("\n")}`.trim();

  if (!transcript) {
    throw new Error(
      "TikTok 콘텐츠에서 스크립트를 확보할 수 없음 · 자막 없고 오디오 URL 도 없음",
    );
  }

  return {
    source: "web",
    url,
    title: meta.title,
    author: meta.authorNickname,
    published: meta.createTime,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

function labelSource(s: "caption" | "stt" | "none"): string {
  if (s === "caption") return "TikTok 자체 자막";
  if (s === "stt") return "Groq Whisper STT (오디오 → 텍스트)";
  return "없음";
}

export function extractFromText(text: string): ExtractedContent {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("텍스트 입력이 비어 있습니다");
  }
  return {
    source: "personal",
    url: null,
    title: null,
    author: null,
    published: null,
    text: trimmed.slice(0, MAX_TEXT_CHARS),
    fetchedAt: new Date().toISOString(),
  };
}
