// POST /api/sangsik/subscribe · 로그인 없이 열린다(proxy.ts 보호 범위 밖).
//
// 응답은 주소의 상태와 상관없이 같다. 등록 여부를 밖에서 알 수 없게 한다.
// 형식 오류 · 동의 누락 · 속도 제한만 다른 응답을 준다(입력한 사람이 고칠 수 있는 것).

import { getDominanceClient } from "@/lib/dominance/db";
import { clientIp, rateLimited } from "@/lib/sangsik/rate-limit";
import { normalizeEmail, subscribe } from "@/lib/sangsik/subscribers";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (rateLimited(`subscribe:${ip ?? "unknown"}`)) {
    return Response.json({ ok: false, error: "잠시 뒤에 다시 시도해 주십시오." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 숨김 칸(honeypot). 사람은 보지 못하는 칸이라 채워져 있으면 자동 입력이다. 성공처럼 보이고 아무것도 하지 않는다.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return Response.json({ ok: true });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ ok: false, error: "이메일 주소를 확인해 주십시오." }, { status: 400 });
  }
  if (body.consent !== true) {
    return Response.json({ ok: false, error: "개인정보 처리 방침에 동의해 주십시오." }, { status: 400 });
  }

  try {
    const r = await subscribe(getDominanceClient(), email, ip);
    if (r.mailError) console.error("sangsik subscribe mail", r.mailError);
  } catch (err) {
    console.error("sangsik subscribe", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "지금은 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주십시오." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
