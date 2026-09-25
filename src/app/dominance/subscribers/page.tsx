// 구독자 · 수치만 본다.
//
// 개별 주소는 화면에 절대 올리지 않는다. 구독자 이메일은 개인정보이고
// 운용에 필요한 것은 "몇 명인가" 뿐이다. 그래서 여기서는 집계만 읽는다.

import { dominanceContext } from "@/lib/dominance/guard";
import { kstDateAfter } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";

export const dynamic = "force-dynamic";

async function countRows(
  db: Awaited<ReturnType<typeof dominanceContext>>["db"],
  build: (q: ReturnType<typeof buildBase>) => ReturnType<typeof buildBase>,
) {
  const { count } = await build(buildBase(db));
  return count ?? 0;
}

function buildBase(db: Awaited<ReturnType<typeof dominanceContext>>["db"]) {
  return db.from("ds_subscribers").select("id", { count: "exact", head: true });
}

export default async function SubscribersPage() {
  const { db } = await dominanceContext();

  // 표가 없는 경우를 먼저 가린다. head:true 집계는 오류를 삼키므로 행으로 확인한다.
  const probe = await db.from("ds_subscribers").select("id").limit(1);
  if (isMissingSchema(probe.error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }

  const weekAgo = kstDateAfter(-7);

  const [total, confirmed, pending, unsubscribed, joinedThisWeek] =
    await Promise.all([
      countRows(db, (q) => q),
      countRows(db, (q) =>
        q.not("confirmed_at", "is", null).is("unsubscribed_at", null),
      ),
      countRows(db, (q) => q.is("confirmed_at", null).is("unsubscribed_at", null)),
      countRows(db, (q) => q.not("unsubscribed_at", "is", null)),
      countRows(db, (q) => q.gte("consent_at", `${weekAgo}T00:00:00+09:00`)),
    ]);

  const confirmRate = total === 0 ? 0 : Math.round((confirmed / total) * 100);

  return (
    <div className="space-y-6">
      <Heading />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="발송 대상"
          value={confirmed}
          hint="확인 메일을 누르고 수신거부하지 않은 사람"
          tone="emerald"
        />
        <Card
          label="확인 대기"
          value={pending}
          hint="폼은 냈지만 확인 메일을 아직 누르지 않았다"
          tone="amber"
        />
        <Card
          label="수신거부"
          value={unsubscribed}
          hint="행은 남긴다. 재구독을 구분해야 한다"
          tone="muted"
        />
        <Card
          label="최근 7일 신규"
          value={joinedThisWeek}
          hint="폼 제출 기준"
          tone="sky"
        />
      </section>

      <section className="rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-4 text-sm">
        <p className="text-foreground/90">
          전체 {total.toLocaleString()}명 가운데 {confirmRate}%가 확인을
          마쳤습니다.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          확인 대기가 계속 쌓이면 확인 메일이 스팸으로 분류되고 있을 수
          있습니다. 그때는 발송 도메인 설정을 먼저 보십시오.
        </p>
      </section>

      <p className="rounded-lg border border-[color:var(--border)]/70 bg-surface/20 p-3 text-xs text-muted-foreground">
        이 화면은 수치만 보여줍니다. 개별 구독자 주소는 개인정보여서 콘솔에
        표시하지 않습니다.
      </p>
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">구독자</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        몇 명에게 나가는지만 확인하는 곳입니다.
      </p>
    </section>
  );
}

const TONE = {
  emerald: "border-emerald-500/30 text-emerald-200",
  amber: "border-amber-500/30 text-amber-200",
  sky: "border-sky-500/30 text-sky-200",
  muted: "border-[color:var(--border)] text-muted-foreground",
} as const;

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof TONE;
}) {
  return (
    <div className={`rounded-xl border bg-surface/30 p-4 ${TONE[tone]}`}>
      <p className="text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
