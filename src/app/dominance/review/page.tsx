// ④ 리뷰 대기 목록 · 다 쓴 글을 한 편씩 열어 본다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { formatKstDateTime } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
  REVIEW_CHECK_LABEL,
  type LetterStatus,
  type ReviewChecks,
} from "@/lib/dominance/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: LetterStatus;
  review_checks: ReviewChecks | null;
  revision_count: number;
  reviewed_at: string | null;
  updated_at: string;
};

const TOTAL_CHECKS = Object.keys(REVIEW_CHECK_LABEL).length;

export default async function ReviewQueuePage() {
  const { db } = await dominanceContext();

  const { data, error } = await db
    .from("ds_letters")
    .select(
      "id, title, status, review_checks, revision_count, reviewed_at, updated_at",
    )
    .in("status", ["draft", "review", "reviewed"])
    .order("updated_at", { ascending: false });

  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }

  const rows = (data ?? []) as Row[];
  const waiting = rows.filter((r) => r.status === "review");
  const passed = rows.filter((r) => r.status === "reviewed");
  const writing = rows.filter((r) => r.status === "draft");

  return (
    <div className="space-y-8">
      <Heading />

      <section className="flex flex-wrap gap-2 text-xs">
        <Count label="리뷰 대기" n={waiting.length} tone="amber" />
        <Count label="리뷰 통과" n={passed.length} tone="violet" />
        <Count label="쓰는 중" n={writing.length} tone="muted" />
      </section>

      <Group
        title="리뷰 대기"
        hint="한 편씩 열어 자동 점검과 교차 리뷰 의견을 확인하십시오."
        rows={waiting}
        empty="리뷰를 기다리는 글이 없습니다."
      />

      <Group
        title="리뷰 통과"
        hint="발행일을 붙일 수 있습니다."
        rows={passed}
        empty={null}
        action={{ href: "/dominance/schedule", label: "⑤ 발행일 붙이기 →" }}
      />

      <Group
        title="쓰는 중"
        hint="아직 다 쓰지 않은 글입니다."
        rows={writing}
        empty={null}
      />
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">④ 리뷰</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        발행 전 마지막 관문입니다. 여기를 통과한 글만 발행일을 받을 수 있습니다.
      </p>
    </section>
  );
}

const COUNT_TONE = {
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  muted: "border-[color:var(--border)] bg-surface/40 text-muted-foreground",
} as const;

function Count({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: keyof typeof COUNT_TONE;
}) {
  return (
    <span className={`rounded-md border px-2.5 py-1 ${COUNT_TONE[tone]}`}>
      {label} {n}
    </span>
  );
}

function Group({
  title,
  hint,
  rows,
  empty,
  action,
}: {
  title: string;
  hint: string;
  rows: Row[];
  empty: string | null;
  action?: { href: string; label: string };
}) {
  if (rows.length === 0 && !empty) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-medium">
          {title} {rows.length}편
        </h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
        {action && rows.length > 0 && (
          <Link
            href={action.href}
            className="ml-auto text-xs text-[color:var(--accent)] hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]/60 rounded-xl border border-[color:var(--border)]/70 bg-surface/30">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LETTER_STATUS_STYLE[r.status]}`}
                >
                  {LETTER_STATUS_LABEL[r.status]}
                </span>
                <h3 className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {r.title}
                </h3>
                <Link
                  href={
                    r.status === "draft"
                      ? `/dominance/letters/${r.id}`
                      : `/dominance/review/${r.id}`
                  }
                  className="shrink-0 rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
                >
                  {r.status === "draft" ? "고치기" : "리뷰하기"}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                <Summary row={r} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Summary({ row }: { row: Row }) {
  const snapshot = row.review_checks;
  const parts: string[] = [];

  if (snapshot) {
    const ok = snapshot.checks.filter((c) => c.passed).length;
    parts.push(`자동 점검 ${ok}/${TOTAL_CHECKS}`);
    parts.push(`교차 리뷰 의견 ${snapshot.crossReview.length}건`);
  } else {
    parts.push("아직 점검하지 않았습니다");
  }

  parts.push(`되돌린 횟수 ${row.revision_count}`);
  parts.push(
    row.reviewed_at
      ? `통과 ${formatKstDateTime(row.reviewed_at)}`
      : `고친 때 ${formatKstDateTime(row.updated_at)}`,
  );

  return <>{parts.join(" · ")}</>;
}
