// KST 날짜 헬퍼.
//
// 크론은 "0 22 * * *" UTC 로 돈다 = 07시 KST. 그 시점의 UTC 날짜는 **어제**다.
// 발행일 비교를 UTC 로 하면 하루씩 밀린다. 그래서 날짜는 전부 이 함수를 통한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** YYYY-MM-DD · KST 기준 오늘. ds_letters.scheduled_for 와 직접 비교한다. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD · KST 기준 오늘 + days */
export function kstDateAfter(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 화면 표기용 · "09-25 (목)" */
export function formatKstDate(date: string | null): string {
  if (!date) return "-";
  const d = new Date(`${date}T00:00:00+09:00`);
  return d.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
}

/** 화면 표기용 · 타임스탬프를 KST 로 */
export function formatKstDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}
