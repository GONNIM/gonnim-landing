// 지배상식 현황 · 5단계 흐름의 각 단계에 몇 건이 걸려 있는지 한 장으로 본다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { loadLatestNeeds } from "@/lib/dominance/needs";
import { loadNextActions, type NextAction } from "@/lib/dominance/next-actions";
import { kstToday, formatKstDate, formatKstDateTime, hoursSince } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
  type LetterStatus,
} from "@/lib/dominance/types";

export const dynamic = "force-dynamic";

export default async function DominanceHome() {
  const { db } = await dominanceContext();
  const today = kstToday();

  // 스키마가 있는지만 본다. 후보 수는 더 쓰지 않는다(D24).
  const { error: candErr } = await db.from("ds_candidates").select("id").limit(1);

  if (isMissingSchema(candErr)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }

  const { data: letters } = await db
    .from("ds_letters")
    .select("id, title, status, scheduled_for, updated_at")
    .order("updated_at", { ascending: false });

  // 크론이 멈춘 것을 여기서 먼저 알린다. 전용 화면이 있어도 열지 않으면 소용없다.
  // 표가 아직 없을 수 있으므로 오류는 무시한다 — 현황이 열리지 않게 만들지 않는다.
  const { data: lastRun } = await db
    .from("ds_cron_runs")
    .select("started_at, summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const staleHours = lastRun ? Math.floor(hoursSince(lastRun.started_at)) : null;

  // ① 이슈는 질문 단위다(D24). 옛 후보(ds_candidates)는 기록 화면에서만 본다.
  const { data: questionRows } = await db.from("ds_questions").select("status");
  const qCount = (s: string) => (questionRows ?? []).filter((q) => q.status === s).length;

  const letterRows = (letters ?? []) as {
    id: string;
    title: string;
    status: LetterStatus;
    scheduled_for: string | null;
    updated_at: string;
  }[];
  const byStatus = (s: LetterStatus) => letterRows.filter((l) => l.status === s);

  const drafting = byStatus("draft");
  const review = byStatus("review");
  const reviewed = byStatus("reviewed");
  const approved = byStatus("approved");
  const dueToday = approved.filter((l) => l.scheduled_for === today);

  // 36차 C · 이번 주 Needs 신호 한 줄
  const needs = await loadLatestNeeds(db).catch(() => null);
  // 48차 G · D53 · 54차 D · 다음 할 일(글 모두 · 보류 · 글 없는 채택 질문 · 나머지는 접힌 칸)
  const nextActions = await loadNextActions(db).catch(() => [] as NextAction[]);

  return (
    <div className="space-y-8">
      <Heading />

      <p className="text-xs text-muted-foreground">
        이번 주 Needs 신호:{" "}
        {needs ? (
          <Link href="/dominance/needs" className="underline">
            수집일 {needs.collectedAt.slice(0, 10)} · 문서 {needs.items.length}개(주 시작 {needs.weekStart})
          </Link>
        ) : (
          "아직 없음(월요일 07:30 크론)"
        )}
      </p>

      <NextActions items={nextActions} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card
          href="/dominance/questions"
          label="① 이슈"
          value={`통과 ${qCount("validated")}개`}
          hint={`제안 ${qCount("proposed")} · 보류 ${qCount("held")} · 채택 ${qCount("adopted")}`}
        />
        <Card
          href="/dominance/letters"
          label="③ 쓰는 중"
          value={`${drafting.length}편`}
          hint={drafting[0]?.title ?? "없음"}
        />
        <Card
          href="/dominance/review"
          label="④ 리뷰 대기"
          value={`${review.length}편`}
          hint="다 쓴 글 · 읽고 통과시킨다"
        />
        <Card
          href="/dominance/schedule"
          label="⑤ 발행일 대기"
          value={`${reviewed.length}편`}
          hint="리뷰 통과 · 날짜를 붙이면 나간다"
        />
        <Card
          href="/dominance/schedule"
          label="발행 예정"
          value={`${approved.length}편`}
          hint={
            dueToday.length > 0
              ? `오늘 ${dueToday.length}편 발행`
              : approved[0]?.scheduled_for
                ? `다음 ${formatKstDate(approved[0].scheduled_for)}`
                : "없음"
          }
        />
      </section>

      {staleHours !== null && staleHours > 26 && (
        <Banner
          tone="red"
          text={`자동 작업이 ${staleHours}시간 동안 돌지 않았습니다. 26시간을 넘겼습니다.`}
          href="/dominance/runs"
          cta="크론 기록 확인 →"
        />
      )}

      {review.length > 0 && (
        <Banner
          tone="amber"
          text={`다 쓴 글 ${review.length}편이 리뷰를 기다립니다.`}
          href="/dominance/review"
          cta="④ 완성 글 리뷰로 →"
        />
      )}
      {reviewed.length > 0 && (
        <Banner
          tone="violet"
          text={`리뷰를 통과한 글 ${reviewed.length}편이 발행일을 기다립니다.`}
          href="/dominance/schedule"
          cta="⑤ 발행일 지정으로 →"
        />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">최근 글</h2>
        {letterRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
            아직 글이 없습니다.
            <br />
            <Link href="/dominance/questions" className="underline">
              ① 이슈 고르기
            </Link>
            에서 쓸 것을 고르고 [글 작성하기]를 누르십시오.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]/60 rounded-xl border border-[color:var(--border)]/70 bg-surface/30">
            {letterRows.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-4">
                <StatusBadge status={l.status} />
                <Link
                  href={`/dominance/letters/${l.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-[color:var(--accent)] dark:hover:text-white"
                >
                  {l.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {l.scheduled_for
                    ? formatKstDate(l.scheduled_for)
                    : formatKstDateTime(l.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">운용 현황</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        이슈 고르기 → 초안 → 수정·재작성 → 완성 글 리뷰 → 발행일 확정. 아무것도 안
        고른 날은 발행이 없습니다 — 그게 정상 경로입니다.
      </p>
    </section>
  );
}

function Card({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[color:var(--border)]/70 bg-surface/40 p-5 transition hover:border-[color:var(--accent)]"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function Banner({
  tone,
  text,
  href,
  cta,
}: {
  tone: "amber" | "violet" | "red";
  text: string;
  href: string;
  cta: string;
}) {
  const style =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-50 dark:bg-amber-950/10 text-amber-700 dark:text-amber-200"
      : tone === "red"
        ? "border-red-500/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-200"
        : "border-violet-500/30 bg-violet-50 dark:bg-violet-950/10 text-violet-700 dark:text-violet-200";
  return (
    <section className={`rounded-xl border p-5 ${style}`}>
      <p className="text-sm font-medium">{text}</p>
      <Link
        href={href}
        className="mt-2 inline-block text-xs underline opacity-80 hover:opacity-100"
      >
        {cta}
      </Link>
    </section>
  );
}

function StatusBadge({ status }: { status: LetterStatus }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LETTER_STATUS_STYLE[status]}`}
    >
      {LETTER_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * 48차 G · D53 · 54차 D · 현황 맨 위 「다음 할 일」.
 * 글 줄을 먼저 모두 보이고, 보류 질문 · 채택 후 글 없는 질문은 그 아래에 바로 보인다.
 * 나머지 질문(채택할 수 있는 질문 등)은 접힌 칸 「질문 {n}건 더 보기」에 둔다.
 */
function NextActions({ items }: { items: NextAction[] }) {
  const letters = items.filter((a) => a.kind === "letter");
  const pinned = items.filter((a) => a.kind === "question" && a.pinned);
  const folded = items.filter((a) => a.kind === "question" && !a.pinned);
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-foreground/90">다음 할 일</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">지금 할 일이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[color:var(--border)]/70">
          <ul className="divide-y divide-[color:var(--border)]/60">
            {[...letters, ...pinned].map((a) => (
              <NextActionRow key={`${a.kind}-${a.id}`} a={a} />
            ))}
          </ul>
          {folded.length > 0 && (
            <details className="border-t border-[color:var(--border)]/60">
              <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground">질문 {folded.length}건 더 보기</summary>
              <ul className="divide-y divide-[color:var(--border)]/60 border-t border-[color:var(--border)]/60">
                {folded.map((a) => (
                  <NextActionRow key={`${a.kind}-${a.id}`} a={a} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function NextActionRow({ a }: { a: NextAction }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="shrink-0 rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {a.kind === "letter" ? "글" : "질문"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{a.title}</p>
        <p className="text-xs text-muted-foreground">{a.line}</p>
        {a.sub && (
          <Link href={a.sub.href} className="text-[11px] text-amber-700 underline dark:text-amber-300">
            {a.sub.line}
          </Link>
        )}
      </div>
      {a.href && a.buttonLabel && (
        <Link
          href={a.href}
          className="shrink-0 rounded-md border border-[color:var(--border)] px-3 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
        >
          {a.buttonLabel}
        </Link>
      )}
    </li>
  );
}
