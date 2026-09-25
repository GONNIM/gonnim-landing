// ③ 글 목록 · 상태별로 묶어 보여준다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { formatKstDate, formatKstDateTime } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
  type LetterStatus,
} from "@/lib/dominance/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: LetterStatus;
  scheduled_for: string | null;
  revision_count: number;
  updated_at: string;
};

const GROUPS: { status: LetterStatus; hint: string }[] = [
  { status: "draft", hint: "고치는 중 · 다 쓰면 리뷰로 올린다" },
  { status: "review", hint: "다 쓴 글 · 리뷰를 기다린다" },
  { status: "reviewed", hint: "리뷰 통과 · 발행일을 붙일 수 있다" },
  { status: "approved", hint: "발행일 확정 · 그날 07시에 나간다" },
  { status: "published", hint: "발행됨 · 고칠 수 없다" },
];

export default async function LettersPage() {
  const { db } = await dominanceContext();

  const { data, error } = await db
    .from("ds_letters")
    .select("id, title, status, scheduled_for, revision_count, updated_at")
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

  return (
    <div className="space-y-8">
      <Heading />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
          아직 글이 없습니다.{" "}
          <Link href="/dominance/candidates" className="underline">
            ① 이슈 목록
          </Link>
          에서 시작하십시오.
        </div>
      ) : (
        GROUPS.map(({ status, hint }) => {
          const group = rows.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="space-y-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-medium">
                  {LETTER_STATUS_LABEL[status]} {group.length}편
                </h2>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </div>
              <ul className="divide-y divide-[color:var(--border)]/60 rounded-xl border border-[color:var(--border)]/70 bg-surface/30">
                {group.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 p-4">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LETTER_STATUS_STYLE[r.status]}`}
                    >
                      {LETTER_STATUS_LABEL[r.status]}
                    </span>
                    <Link
                      href={
                        r.status === "review"
                          ? `/dominance/review/${r.id}`
                          : `/dominance/letters/${r.id}`
                      }
                      className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-white"
                    >
                      {r.title}
                    </Link>
                    {r.revision_count > 0 && (
                      <span className="shrink-0 text-xs text-amber-300/80">
                        되돌림 {r.revision_count}회
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.scheduled_for
                        ? formatKstDate(r.scheduled_for)
                        : formatKstDateTime(r.updated_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">③ 글</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        초안을 고쳐 쓰는 곳입니다. 전부 지우고 처음부터 쓰셔도 됩니다.
      </p>
    </section>
  );
}
