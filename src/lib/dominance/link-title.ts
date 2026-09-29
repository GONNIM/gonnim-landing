// [이슈 만들기] 링크 입력 · 페이지 제목만 읽는다.
//
// 본문은 읽지도 저장하지도 않는다(18차 C-2). 응답을 조금씩 받다가 </head> 가 보이면 바로 끊고,
// 그 앞부분에서 og:title 또는 <title> 만 꺼낸다. 끝내 못 읽으면 운영자가 제목을 직접 적는다.

const MAX_HEAD_BYTES = 128 * 1024;

export type LinkTitle = { ok: true; title: string } | { ok: false; reason: string };

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromHead(head: string): string | null {
  const og =
    head.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
    head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (og?.[1]) return decode(og[1]) || null;
  const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t?.[1] ? decode(t[1]) || null : null;
}

export async function readLinkTitle(raw: string): Promise<LinkTitle> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "주소 형식이 아닙니다" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "http 또는 https 주소만 읽습니다" };
  }

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (gonnim-dominance; title only)", Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !res.body) return { ok: false, reason: `페이지가 열리지 않았습니다 (HTTP ${res.status})` };
    if (!(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body.cancel();
      return { ok: false, reason: "HTML 페이지가 아닙니다" };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let head = "";
    let bytes = 0;
    while (bytes < MAX_HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      head += decoder.decode(value, { stream: true });
      const end = head.search(/<\/head>|<body[\s>]/i);
      if (end >= 0) {
        head = head.slice(0, end);
        break;
      }
    }
    // 본문을 더 받지 않는다.
    await reader.cancel().catch(() => {});

    const title = titleFromHead(head);
    return title ? { ok: true, title } : { ok: false, reason: "제목을 찾지 못했습니다" };
  } catch (e) {
    return { ok: false, reason: `읽지 못했습니다 (${String(e).slice(0, 80)})` };
  }
}
