/**
 * Cloudflare Turnstile 서버 verify.
 * env `TURNSTILE_SECRET_KEY` 없으면 skip (개발/Preview 안전 · 프로덕션 사용자 실행 후 활성).
 * env `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 는 client 위젯용 (별개).
 */

type TurnstileResult = {
  ok: boolean;
  reason?: string;
};

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: true, reason: "skip (TURNSTILE_SECRET_KEY 미설정)" };
  }
  if (!token) {
    return { ok: false, reason: "봇 방지 검증 토큰이 없습니다." };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    if (!res.ok) {
      return { ok: false, reason: `Turnstile HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return {
        ok: false,
        reason: `봇 방지 검증 실패 (${(data["error-codes"] ?? []).join(", ")})`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("[turnstile] verify 예외", err);
    return { ok: false, reason: "봇 방지 검증 중 오류가 발생했습니다." };
  }
}

export function isTurnstileEnabled(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}
