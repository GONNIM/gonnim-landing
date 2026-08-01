// Threads (Meta) — 소셜 봇 UA 로 SSR og:* meta 추출
//
// 이유: threads.com 은 SPA · 일반 UA 로는 og:* meta 없음.
//       facebookexternalhit UA 로 요청 시 링크 미리보기용 SSR meta 반환.
// 확보 가능: og:title (작성자 표시명) · og:image (첨부 이미지) · og:url
// 확보 불가: og:description (본문 텍스트) — Threads 정책으로 노출 안 함
// 대안: og:image → z.ai Vision (glm-4.6v-flash) 로 텍스트 추출 (useVision 옵션)

import * as cheerio from "cheerio";

const SOCIAL_BOT_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const FETCH_TIMEOUT_MS = 20_000;

export type ThreadsMeta = {
  url: string;
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export async function fetchThreadsMeta(url: string): Promise<ThreadsMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
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
      throw new Error(
        `Threads fetch 실패 · ${res.status} · 비공개이거나 삭제된 게시물일 수 있음`,
      );
    }
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const imageUrl = $('meta[property="og:image"]').attr("content")?.trim() || null;
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || null;

  if (!title && !imageUrl) {
    throw new Error("Threads 페이지에서 og:* meta 를 찾을 수 없음");
  }

  return { url, title, imageUrl, siteName };
}
