// POST /api/sangsik/unsubscribe · 토큰 없이 수신거부를 원할 때 링크를 메일로 보낸다.
// 등록 여부를 밖에서 알 수 없게, 주소가 있든 없든 같은 응답을 준다.

import { getDominanceClient } from "@/lib/dominance/db";
import { clientIp, rateLimited } from "@/lib/sangsik/rate-limit";
import { normalizeEmail, requestUnsubscribeLink } from "@/lib/sangsik/subscribers";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (rateLimited(`unsubscribe:${ip ?? "unknown"}`)) {
    return Response.json({ ok: false, error: "잠시 뒤에 다시 시도해 주십시오." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return Response.json({ ok: true });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ ok: false, error: "이메일 주소를 확인해 주십시오." }, { status: 400 });
  }

  try {
    const r = await requestUnsubscribeLink(getDominanceClient(), email);
    if (r.mailError) console.error("sangsik unsubscribe mail", r.mailError);
  } catch (err) {
    console.error("sangsik unsubscribe", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "지금은 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주십시오." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
