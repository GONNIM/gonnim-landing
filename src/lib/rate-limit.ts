/**
 * Upstash Redis 기반 slidng-window rate limit (5min 에 3회).
 * env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 없으면 skip.
 * npm dep 없이 REST API 직접 호출 (fetch).
 */

const WINDOW_SECONDS = 300; // 5분
const MAX_REQUESTS = 3;

type RateLimitResult = {
  ok: boolean;
  reason?: string;
  remaining?: number;
};

export async function checkRateLimit(
  key: string,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { ok: true, reason: "skip (Upstash 미설정)" };
  }
  const bucket = `ratelimit:contact:${key}`;
  try {
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!incrRes.ok) throw new Error(`incr HTTP ${incrRes.status}`);
    const { result: count } = (await incrRes.json()) as { result: number };
    if (count === 1) {
      // 첫 요청 → TTL 세팅
      await fetch(
        `${url}/expire/${encodeURIComponent(bucket)}/${WINDOW_SECONDS}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    }
    if (count > MAX_REQUESTS) {
      return {
        ok: false,
        reason: `짧은 시간에 요청이 너무 많습니다. 5분 후 다시 시도해주세요.`,
        remaining: 0,
      };
    }
    return { ok: true, remaining: Math.max(0, MAX_REQUESTS - count) };
  } catch (err) {
    console.error("[rate-limit] Upstash 오류", err);
    // fail-open · 통과 (rate limit 자체 이슈로 정상 요청 막지 않음)
    return { ok: true, reason: "Upstash 오류 · fail-open" };
  }
}

export function isRateLimitEnabled(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
