// ⑤ 발행일 · 모든 날짜를 보여준다. 월·수·금은 추천일이고 제한이 아니다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { kstToday } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import type { LetterStatus } from "@/lib/dominance/types";
import { ScheduleCalendar } from "./ScheduleCalendar";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: LetterStatus;
  scheduled_for: string | null;
  reviewed_at: string | null;
  revision_count: number;
};

const SELECT =
  "id, title, status, scheduled_for, reviewed_at, revision_count";

/** "2026-09" 을 받아 달의 첫날과 마지막날, 1일의 요일을 낸다. */
function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year: y,
    month: m,
    dayCount,
    firstWeekday,
    first: `${y}-${pad(m)}-01`,
    last: `${y}-${pad(m)}-${pad(dayCount)}`,
    prev: m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`,
    next: m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`,
  };
}

function normalizeMonth(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
  return kstToday().slice(0, 7);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const month = normalizeMonth(m);
  const bounds = monthBounds(month);

  const { db } = await dominanceContext();

  const [scheduled, pool] = await Promise.all([
    db
      .from("ds_letters")
      .select(SELECT)
      .gte("scheduled_for", bounds.first)
      .lte("scheduled_for", bounds.last)
      .in("status", ["approved", "published"])
      .order("scheduled_for", { ascending: true }),
    db
      .from("ds_letters")
      .select(SELECT)
      .eq("status", "reviewed")
      .order("reviewed_at", { ascending: true }),
  ]);

  if (isMissingSchema(scheduled.error) || isMissingSchema(pool.error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading />
      <ScheduleCalendar
        month={month}
        today={kstToday()}
        bounds={{
          dayCount: bounds.dayCount,
          firstWeekday: bounds.firstWeekday,
          year: bounds.year,
          monthNumber: bounds.month,
        }}
        prevHref={`/dominance/schedule?m=${bounds.prev}`}
        nextHref={`/dominance/schedule?m=${bounds.next}`}
        todayHref={`/dominance/schedule?m=${kstToday().slice(0, 7)}`}
        scheduled={(scheduled.data ?? []) as Row[]}
        pool={(pool.data ?? []) as Row[]}
      />
      <p className="text-xs text-muted-foreground">
        발행일은 데이터로만 저장됩니다. 코드에는 요일 조건이 없으므로 일요일이나
        12월 31일을 고르셔도 그날 발행됩니다.{" "}
        <Link href="/dominance/review" className="underline">
          ④ 리뷰
        </Link>
        를 통과한 글만 여기에 나옵니다.
      </p>
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">⑤ 발행일</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        리뷰를 통과한 글에 날짜를 붙입니다. 붙인 날 아침 07시에 발행됩니다.
      </p>
    </section>
  );
}
