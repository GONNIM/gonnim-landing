// IP 당 분당 요청 제한. 서버리스 인스턴스마다 따로 세는 메모리 방식이다.
// 인스턴스가 여럿이면 합계는 제한보다 커질 수 있다 — 막는 목적은 폼 한 곳을 두드리는
// 단순한 반복이다. 본격적인 제한이 필요해지면 저장소가 있는 방식으로 바꾼다.

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit = 5, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);

  // 오래된 키가 쌓이지 않게 가끔 비운다.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return false;
}

export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || headers.get("x-real-ip");
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}
