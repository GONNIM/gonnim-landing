// 선완성 후발행(D40)을 코드로도 지킨다.
//
// DS_PUBLISHING_STARTED 가 켜지기 전("1" 이 아니면)에는
// - "발행 예정 글 없음" 경보를 보내지 않는다(크론 요약에 "발행 전 기간" 한 줄만 남긴다)
// - 발행 달력의 [승인하고 날짜 확정] 을 잠그고, 서버에서도 거부한다.
// 켜는 날은 운영자가 발행 시작을 선언하는 날이다(런북 11번).

export function publishingStarted(): boolean {
  return process.env.DS_PUBLISHING_STARTED === "1";
}

export const PRE_PUBLISHING_NOTE = "발행 전 기간";
export const PRE_PUBLISHING_REASON = "발행 시작 선언 전입니다. 운영자가 선언하는 날 DS_PUBLISHING_STARTED 를 켭니다(런북 11번).";
