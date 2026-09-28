// 확인 · 수신거부 링크의 서명 토큰. 스키마를 바꾸지 않으려고 DB 에 토큰을 저장하지 않는다.
//
// 토큰 = base64url("<구독자 id>.<용도>.<만료 ms>") + "." + HMAC-SHA256 서명.
// 비밀값은 DS_LINK_SECRET 하나만 쓴다. 다른 용도의 비밀값을 재사용하지 않는다 —
// 하나가 새면 다른 것까지 위조할 수 있게 되기 때문이다.

import { createHmac, timingSafeEqual } from "node:crypto";

export type LinkPurpose = "confirm" | "unsubscribe";

/** 확인 링크는 7일 뒤 만료된다. 수신거부 링크는 만료가 없다(언제 눌러도 끊겨야 한다). */
const CONFIRM_TTL_MS = 7 * 86_400_000;

function secret(): string {
  const s = process.env.DS_LINK_SECRET;
  if (!s || s.length < 32) throw new Error("DS_LINK_SECRET 없음 또는 너무 짧음");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signLink(id: string, purpose: LinkPurpose, now: number = Date.now()): string {
  const exp = purpose === "confirm" ? now + CONFIRM_TTL_MS : 0;
  const body = `${id}.${purpose}.${exp}`;
  return `${Buffer.from(body).toString("base64url")}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid" | "expired" };

export function verifyLink(
  token: string | undefined | null,
  purpose: LinkPurpose,
  now: number = Date.now(),
): VerifyResult {
  if (!token || token.length > 400) return { ok: false, reason: "invalid" };
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return { ok: false, reason: "invalid" };

  let body: string;
  try {
    body = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }

  const [id, p, expRaw] = body.split(".");
  if (!id || p !== purpose) return { ok: false, reason: "invalid" };
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  if (exp !== 0 && exp < now) return { ok: false, reason: "expired" };

  return { ok: true, id };
}
