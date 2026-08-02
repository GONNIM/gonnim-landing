// Instagram (Post · Reel · IGTV) — 공식 embed/captioned SSR
//
// 이유: instagram.com/p|reel|tv/{shortcode} 는 SPA · 순수 fetch 로 캡션 없음.
//       embed/captioned 페이지는 SSR 로 캡션 렌더링 (Facebook 임베드와 동일 Meta 인프라).
// 확보 가능: og:title/og:image · embed 페이지 캡션 (선택 selectors 다중 시도)
// 확보 불가: 비디오 mp4 URL 직접 접근 · IG 비디오는 로그인 게이트 · Phase 1 후보

import * as cheerio from "cheerio";

const SOCIAL_BOT_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const FETCH_TIMEOUT_MS = 20_000;

export type InstagramMeta = {
  url: string;
  title: string | null;
  caption: string | null; // embed/captioned 페이지에서 추출 · 전체 본문
  imageUrl: string | null;
  siteName: string | null;
};

export async function fetchInstagramMeta(url: string): Promise<InstagramMeta> {
  const canonical = normalizeInstagramUrl(url);
  const embedUrl = buildEmbedUrl(canonical);

  // 병렬: 표준 페이지 (og:*) + 임베드 (캡션)
  const [html, embedHtml] = await Promise.all([
    fetchHtml(canonical).catch(() => ""),
    fetchHtml(embedUrl).catch(() => ""),
  ]);

  const $ = cheerio.load(html || "<html></html>");
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $('meta[name="twitter:title"]').attr("content")?.trim() ||
    null;
  const imageUrl = $('meta[property="og:image"]').attr("content")?.trim() || null;
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || null;

  const caption = embedHtml ? extractCaptionFromEmbed(embedHtml) : null;

  if (!title && !caption && !imageUrl) {
    throw new Error("Instagram 페이지에서 유효한 데이터를 확보할 수 없음");
  }

  return { url: canonical, title, caption, imageUrl, siteName };
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": SOCIAL_BOT_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Instagram fetch 실패 · ${res.status} · ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 표준 Instagram URL 로 정규화 · 쿼리·utm 제거 · 트레일링 슬래시 유지
function normalizeInstagramUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = "www.instagram.com";
    u.search = "";
    u.hash = "";
    if (!u.pathname.endsWith("/")) u.pathname = u.pathname + "/";
    return u.toString();
  } catch {
    return url;
  }
}

// 공식 embed/captioned 페이지 (SSR 캡션 렌더링)
function buildEmbedUrl(canonicalUrl: string): string {
  try {
    const u = new URL(canonicalUrl);
    if (!u.pathname.endsWith("embed/") && !u.pathname.endsWith("embed/captioned/")) {
      u.pathname = u.pathname + "embed/captioned/";
    }
    return u.toString();
  } catch {
    return canonicalUrl;
  }
}

// Instagram embed 페이지의 캡션 selector 다중 시도
// (공식 마크업 · 시간에 따라 변경 가능 · 폴백 순차)
function extractCaptionFromEmbed(html: string): string | null {
  const $ = cheerio.load(html);
  // 노이즈 제거
  $("script, style, .UsernameText, .SharedInstagramLoad").remove();

  const selectors = [
    ".Caption",
    ".EmbeddedMediaCaption",
    "[data-instgrm-captioned]",
    ".CaptionComments",
    "blockquote.instagram-media p",
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const text = el.text().replace(/\s+/g, " ").trim();
    if (text.length > 20) return text;
  }
  return null;
}
