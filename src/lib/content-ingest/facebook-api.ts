// Facebook (Reel · Video · Watch) — 소셜 봇 UA 로 SSR og:* meta 추출
//
// 이유: facebook.com/*/reel|videos 는 로그인 게이트 · 일반 UA 로 400/403
//       facebookexternalhit UA 로 요청 시 og:url + og:image SSR meta 반환
// 확보 가능: og:url path 세그먼트에 인코딩된 제목/설명 · og:image (썸네일)
// 확보 불가: og:title/og:description/og:video · 음성/자막 자동 접근 (Facebook 폐쇄 정책)
// 대안: og:image → z.ai Vision (useVision 옵션) · 썸네일 하이라이트 텍스트 추출

import * as cheerio from "cheerio";

// m.facebook.com + iPhone UA 로 요청 시 og:video · og:video:secure_url 반환 (mp4 URL).
// desktop www.facebook.com 은 og:video 없음 · og:url path 제목만.
// 두 소스 모두 활용해 최대 데이터 확보.
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SOCIAL_BOT_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const FETCH_TIMEOUT_MS = 20_000;

export type FacebookMeta = {
  url: string;
  decodedTitle: string | null; // og:url path 디코드 결과 (Facebook 은 여기에 제목 인코딩)
  imageUrl: string | null;
  videoUrl: string | null; // og:video:secure_url · mp4 · Groq Whisper STT 입력
  siteName: string | null;
};

export async function fetchFacebookMeta(url: string): Promise<FacebookMeta> {
  const mobileUrl = normalizeToMobile(url);

  // 1. mobile · iPhone UA 로 og:video 확보 시도
  const mobileHtml = await fetchHtml(mobileUrl, MOBILE_UA);
  const $m = cheerio.load(mobileHtml);
  const videoUrl =
    $m('meta[property="og:video:secure_url"]').attr("content")?.trim() ||
    $m('meta[property="og:video"]').attr("content")?.trim() ||
    null;

  // 2. desktop · facebookexternalhit UA 로 og:url path 인코딩 제목 확보 시도
  const desktopUrl = normalizeToDesktop(url);
  const desktopHtml = await fetchHtml(desktopUrl, SOCIAL_BOT_UA);
  const $d = cheerio.load(desktopHtml);
  const ogUrl = $d('meta[property="og:url"]').attr("content")?.trim() || null;
  const desktopImage =
    $d('meta[property="og:image"]').attr("content")?.trim() || null;
  const mobileImage =
    $m('meta[property="og:image"]').attr("content")?.trim() || null;
  const siteName =
    $d('meta[property="og:site_name"]').attr("content")?.trim() ||
    $m('meta[property="og:site_name"]').attr("content")?.trim() ||
    null;

  const decodedTitle = ogUrl ? decodeTitleFromOgUrl(ogUrl) : null;
  const imageUrl = desktopImage || mobileImage;

  if (!decodedTitle && !imageUrl && !videoUrl) {
    throw new Error("Facebook 페이지에서 유효한 og:* meta 를 찾을 수 없음");
  }

  return { url, decodedTitle, imageUrl, videoUrl, siteName };
}

async function fetchHtml(url: string, ua: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Facebook fetch 실패 · ${res.status} · ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeToMobile(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "www.facebook.com" || u.hostname === "facebook.com") {
      u.hostname = "m.facebook.com";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function normalizeToDesktop(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "m.facebook.com") {
      u.hostname = "www.facebook.com";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

// og:url path 세그먼트 중 URL-인코딩된 (한글 %XX) 세그먼트를 찾아 제목으로 복원.
// 예: /61553012458583/videos/%ED%8F%89%EC%83%9D-%EB%8F%88%EC%9D%84-.../961200703679074/
//   → "평생 돈을 벌어도..." 텍스트 반환.
function decodeTitleFromOgUrl(ogUrl: string): string | null {
  try {
    const parsed = new URL(ogUrl);
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // 인코딩된 세그먼트 (%XX 다수 포함) 우선 · 아니면 hyphen 다수 세그먼트
    const encoded = segments.find((s) => /%[0-9A-Fa-f]{2}/.test(s));
    if (encoded) {
      const decoded = decodeURIComponent(encoded).replace(/-/g, " ").trim();
      return decoded || null;
    }
    return null;
  } catch {
    return null;
  }
}
