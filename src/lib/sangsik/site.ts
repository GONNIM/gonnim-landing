// 공개면(구독 · 글)의 주소. D38 — 우선 gonnim.dev/sangsik 에 둔다.
export const SANGSIK_BASE = "https://gonnim.dev/sangsik";

export function letterPageUrl(slug: string): string {
  return `${SANGSIK_BASE}/l/${encodeURIComponent(slug)}`;
}

/** 발송 메일 하단의 발신자 한 줄. 발행 메일 · 확인 메일 · 수신거부 안내 메일이 같이 쓴다. */
export const SENDER_LINE = "지배상식 · 발신 hi@gonnim.dev · 수신거부는 아래 링크";
