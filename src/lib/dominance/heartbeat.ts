// 하트비트 · 크론이 "아예 돌지 않은" 경우를 외부에서 잡는다.
//
// 크론 안의 ⑤단계 경보는 "돌았지만 상태가 나쁘다" 만 알린다. 돌지 않으면
// 경보를 보낼 코드 자체가 실행되지 않으므로 아무 일도 일어나지 않는다.
// 그 빈칸을 외부 서비스가 메운다 — 정해진 시간 안에 신호가 오지 않으면
// 그쪽이 메일을 보낸다. 감시자를 감시 대상 밖에 두는 유일한 방법이다.
//
// 문서 실사(2026-09-25): Vercel Hobby 는 크론 실패를 알려주지 않고 런타임 로그를
// 1시간만 보관한다. 전달 자체가 최선 노력이라 거른 실행은 로그에도 없다.
//
// 주소가 없으면 아무것도 하지 않는다. 감시가 없는 것과 크론이 깨지는 것은
// 다른 문제이고, 후자를 만들지 않는다.

export type HeartbeatResult = "ok" | "fail" | "skipped" | "error";

/**
 * @param healthy false 면 실패 신호를 보내 즉시 경보가 나가게 한다.
 *   유예 시간을 기다리지 않아도 되므로 감지가 하루 빨라진다.
 */
export async function pingHeartbeat(
  healthy: boolean,
  detail: string,
): Promise<HeartbeatResult> {
  const base = process.env.DS_HEARTBEAT_URL?.trim();
  if (!base) return "skipped";

  const url = healthy ? base : `${base.replace(/\/$/, "")}/fail`;

  try {
    // 본문에 사유를 함께 보낸다. 감시 서비스가 기록해 주므로 메일만 보고도
    // 무엇이 틀어졌는지 알 수 있다.
    const res = await fetch(url, {
      method: "POST",
      body: detail.slice(0, 2000),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "error";
    return healthy ? "ok" : "fail";
  } catch {
    return "error";
  }
}
