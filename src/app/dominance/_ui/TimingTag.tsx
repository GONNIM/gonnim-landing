// 56차 D · 화면 자료 읽기 단계 시간을 HTML 안에 JSON 으로 남긴다(측정 스크립트가 읽음 · 화면에는 보이지 않음).
// 페이지(서버 컴포넌트)는 Server-Timing 헤더를 붙일 수 없어 이 표로 대신한다. 헤더는 /api/cron/dominance-timing 이 붙인다.

import type { Timer } from "@/lib/dominance/timing";

export function TimingTag({ t }: { t: Timer }) {
  t.log();
  const json = JSON.stringify({ page: t.page, total: t.total(), marks: t.marks() }).replace(/</g, "\\u003c");
  return <script type="application/json" data-ds-timing="" dangerouslySetInnerHTML={{ __html: json }} />;
}
