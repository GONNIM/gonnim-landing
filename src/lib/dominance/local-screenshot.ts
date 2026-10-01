// 38차 A-1 · 화면 그림을 찍기 위한 로컬 로그인 우회.
//
// 배포에서는 절대 켜지지 않는다. 아래 네 조건이 모두 맞을 때만 우회한다.
//   1) NODE_ENV === "development"  — next build · Vercel 배포는 언제나 "production" 이다
//   2) VERCEL 환경변수가 없음       — Vercel 의 어떤 환경(Preview 포함)에서도 꺼진다
//   3) DS_LOCAL_SCREENSHOT === "1"  — .env.local 에만 둔다. Vercel 에는 넣지 않는다
//   4) 요청 호스트가 localhost      — 같은 네트워크의 다른 기기에서 열어도 꺼진다
// 조건이 맞으면 RADAR_ADMIN_EMAILS 의 첫 주소를 로그인한 사람으로 본다(세션 확인을 건너뜀).

export function localScreenshotEmail(host: string | null | undefined): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (process.env.VERCEL) return null;
  if (process.env.DS_LOCAL_SCREENSHOT !== "1") return null;
  const name = (host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (name !== "localhost") return null;
  const first = (process.env.RADAR_ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  return first || null;
}
