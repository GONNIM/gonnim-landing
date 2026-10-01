// POST /api/sangsik/signal · 웹 글 페이지 끝 도달 (D42 ② · 26차 C-2).
//
// 쿠키 · 식별자를 쓰지 않는다. 레터별 숫자 하나만 올린다.
// 같은 탭의 두 번째 신호는 페이지 쪽(sessionStorage)에서 보내지 않는다. 서버는 IP 당 분당 횟수만 막는다(IP 는 저장하지 않는다).

import { getDominanceClient } from "@/lib/dominance/db";
import { bumpReaction } from "@/lib/dominance/reactions";
import { clientIp, rateLimited } from "@/lib/sangsik/rate-limit";
import { verifyLetterKind } from "@/lib/sangsik/token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const letterId = form.get("l") ?? "";
  if (!UUID.test(letterId) || !verifyLetterKind(letterId, "end", form.get("s"))) return new Response(null, { status: 400 });
  if (rateLimited(`signal:${clientIp(request.headers) ?? "unknown"}`, 10)) return new Response(null, { status: 204 });
  try {
    await bumpReaction(getDominanceClient(), letterId, { end: 1 });
  } catch (err) {
    console.error("sangsik signal", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 204 });
}
