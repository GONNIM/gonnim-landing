// URL·텍스트 → ExtractedContent 정규화
//
// URL: HTTP fetch → cheerio 로 script/style/nav 제거 → 본문 텍스트만 추출
// 텍스트: 원문 그대로 (source=personal)
// TikTok URL: oEmbed API 우선 (JS 렌더링 페이지 우회)
//
// 실패 케이스는 명확한 에러 던짐 (fallback 없음).

import * as cheerio from "cheerio";
import { fetchTikTokMeta } from "./tiktok-api";
import { fetchThreadsMeta } from "./threads-api";
import { fetchFacebookMeta } from "./facebook-api";
import { transcribeFromUrl } from "./transcript";
import { extractTextFromImage } from "./vision";
import type { ExtractedContent } from "./types";

export type ExtractOptions = {
  // Threads/Instagram 등 이미지 게시물에서 z.ai Vision 으로 이미지 텍스트 추출
  useVision?: boolean;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 40_000;

export async function extractFromUrl(
  url: string,
  options: ExtractOptions = {},
): Promise<ExtractedContent> {
  const parsed = new URL(url);
  if (parsed.hostname.endsWith("tiktok.com")) {
    return extractFromTikTok(parsed.toString());
  }
  if (parsed.hostname.endsWith("threads.com") || parsed.hostname.endsWith("threads.net")) {
    return extractFromThreads(parsed.toString(), options);
  }
  if (
    parsed.hostname.endsWith("facebook.com") ||
    parsed.hostname === "fb.watch" ||
    parsed.hostname.endsWith("fb.com")
  ) {
    return extractFromFacebook(parsed.toString(), options);
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

// Threads URL → 소셜 봇 UA og:* 추출 · useVision 옵션 시 og:image → z.ai Vision
async function extractFromThreads(
  url: string,
  options: ExtractOptions,
): Promise<ExtractedContent> {
  const meta = await fetchThreadsMeta(url);

  let imageText = "";
  let imageTextKind: "text" | "description" | "none" = "none";

  if (options.useVision && meta.imageUrl) {
    try {
      const vision = await extractTextFromImage(meta.imageUrl);
      imageText = vision.text;
      imageTextKind = vision.kind;
    } catch (err) {
      // Vision 실패는 fatal 아님 · og:* 만으로 계속 진행
      imageText = `[Vision 추출 실패: ${err instanceof Error ? err.message : String(err)}]`;
      imageTextKind = "none";
    }
  }

  const header: string[] = [];
  if (meta.title) header.push(`제목: ${meta.title}`);
  if (meta.imageUrl) header.push(`이미지: ${meta.imageUrl}`);
  header.push(`이미지 텍스트 출처: ${labelThreadsSource(options.useVision, imageTextKind)}`);

  const bodyParts: string[] = [];
  if (imageText) {
    bodyParts.push(imageTextKind === "text" ? "[이미지 텍스트]" : "[이미지 설명]");
    bodyParts.push(imageText);
  } else if (options.useVision) {
    bodyParts.push("[이미지 텍스트 없음]");
  } else {
    bodyParts.push(
      "[본문 텍스트는 Threads 링크 미리보기에 노출되지 않음 · 필요 시 Threads 앱에서 텍스트 복사 후 재입력 또는 이미지 텍스트 추출 옵션 활성]",
    );
  }

  const text = `${header.join("\n")}\n\n${bodyParts.join("\n")}`.trim();

  return {
    source: "web",
    url,
    title: meta.title,
    author: null,
    published: null,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

function labelThreadsSource(
  useVision: boolean | undefined,
  kind: "text" | "description" | "none",
): string {
  if (!useVision) return "미사용 (og:* meta 만)";
  if (kind === "text") return "z.ai GLM-4.6V (이미지 텍스트 OCR)";
  if (kind === "description") return "z.ai GLM-4.6V (텍스트 없어 이미지 묘사)";
  return "실패 or 없음";
}

// Facebook (Reel/Video/Watch) URL → 소셜 봇 UA og:* · useVision 시 썸네일 → z.ai Vision
async function extractFromFacebook(
  url: string,
  options: ExtractOptions,
): Promise<ExtractedContent> {
  const meta = await fetchFacebookMeta(url);

  let imageText = "";
  let imageTextKind: "text" | "description" | "none" = "none";

  if (options.useVision && meta.imageUrl) {
    try {
      const vision = await extractTextFromImage(meta.imageUrl);
      imageText = vision.text;
      imageTextKind = vision.kind;
    } catch (err) {
      imageText = `[Vision 추출 실패: ${err instanceof Error ? err.message : String(err)}]`;
      imageTextKind = "none";
    }
  }

  const header: string[] = [];
  if (meta.decodedTitle) header.push(`제목: ${meta.decodedTitle}`);
  if (meta.imageUrl) header.push(`썸네일: ${meta.imageUrl}`);
  header.push(`텍스트 출처: ${labelFacebookSource(options.useVision, imageTextKind)}`);

  const bodyParts: string[] = [];
  if (imageText) {
    bodyParts.push(imageTextKind === "text" ? "[썸네일 텍스트]" : "[썸네일 묘사]");
    bodyParts.push(imageText);
  }
  if (!imageText || imageTextKind === "description") {
    bodyParts.push(
      "[Facebook 은 비디오 자막·음성을 링크 미리보기에 노출하지 않음 · 실 스크립트 필요 시 Facebook 앱에서 자막/설명 복사 후 텍스트 붙여넣기]",
    );
  }

  const text = `${header.join("\n")}\n\n${bodyParts.join("\n")}`.trim();

  return {
    source: "web",
    url,
    title: meta.decodedTitle,
    author: null,
    published: null,
    text,
    fetchedAt: new Date().toISOString(),
  };
}

function labelFacebookSource(
  useVision: boolean | undefined,
  kind: "text" | "description" | "none",
): string {
  if (!useVision) return "og:url 디코드 (제목만)";
  if (kind === "text") return "og:url + z.ai GLM-4.6V (썸네일 텍스트 OCR)";
  if (kind === "description") return "og:url + z.ai GLM-4.6V (썸네일 묘사)";
  return "og:url 디코드 (Vision 실패)";
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
