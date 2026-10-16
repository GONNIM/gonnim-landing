// 59차 C · 「기록」 · 발행된 글 한 편이 한 줄. 발행 예정 글은 맨 위에 「발행 예정 {날짜}」로 둔다.
// 상세(/dominance/history/[id])는 letterPackage 를 쓴다. 다음 차수의 변환 기능은 상세에서 들어간다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { dominanceLetterUrl } from "@/lib/dominance/db";
import { formatKstDate, formatKstDateTime } from "@/lib/dominance/kst";
import { approvedKindOf } from "@/lib/dominance/letter-package";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: "approved" | "published";
  scheduled_for: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  sent_at: string | null;
  sent_count: number | null;
};

export default async function HistoryPage() {
  const { db } = await dominanceContext();
  const { data, error } = await db
    .from("ds_letters")
    .select("id, slug, title, status, scheduled_for, reviewed_at, approved_at, approved_by, published_at, sent_at, sent_count")
    .in("status", ["approved", "published"]);
  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }
  const rows = (data ?? []) as Row[];
  // 65차 A · 「작성 완료」 칸은 감사 기록 review_submit 의 마지막 시각. 그 전에 나간 글은 「기록 없음」
  const { data: submits } = await db
    .from("ds_letter_audit")
    .select("letter_id, created_at")
    .eq("event", "review_submit")
    .in("letter_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at");
  const finished = new Map(((submits ?? []) as { letter_id: string; created_at: string }[]).map((s) => [s.letter_id, s.created_at]));
  const upcoming = rows.filter((r) => r.status === "approved").sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
  const published = rows
    .filter((r) => r.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));

  return (
    <div className="space-y-6">
      <Heading />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 발행된 글이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[color:var(--border)]">
                <th className="py-2 pr-3">발행일</th>
                <th className="py-2 pr-3">제목</th>
                <th className="py-2 pr-3">작성 완료</th>
                <th className="py-2 pr-3">리뷰 통과</th>
                <th className="py-2 pr-3">승인</th>
                <th className="py-2 pr-3">발송 시각</th>
                <th className="py-2 pr-3">받는 수</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {[...upcoming, ...published].map((r) => {
                const kind = approvedKindOf(r.approved_by);
                return (
                  <tr key={r.id} className="border-b border-[color:var(--border)]/50 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.status === "approved" ? (
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-200">
                          발행 예정 {formatKstDate(r.scheduled_for)}
                        </span>
                      ) : (
                        formatKstDate(r.scheduled_for)
                      )}
                    </td>
                    <td className="py-2 pr-3 text-sm text-foreground">{r.title}</td>
                    {finished.has(r.id) ? (
                      <td className="py-2 pr-3 whitespace-nowrap">{formatKstDateTime(finished.get(r.id)!)}</td>
                    ) : (
                      <td className="py-2 pr-3 text-muted-foreground" title="65차 전에 「작성 완료」한 글은 감사 기록이 없습니다">
                        기록 없음
                      </td>
                    )}
                    <td className="py-2 pr-3 whitespace-nowrap">{formatKstDateTime(r.reviewed_at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatKstDateTime(r.approved_at)}
                      {kind && <span className="ml-1 text-muted-foreground">· {kind}</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.status === "published" ? formatKstDateTime(r.sent_at ?? r.published_at) : "—"}</td>
                    <td className="py-2 pr-3">{r.status === "published" ? (r.sent_count ?? 0) : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.status === "published" && (
                        <a href={dominanceLetterUrl(r.slug)} target="_blank" rel="noreferrer" className="underline">
                          웹 글 ↗
                        </a>
                      )}
                      <Link href={`/dominance/history/${r.id}`} className="ml-3 underline">
                        상세
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">기록</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        발행된 글 한 편이 한 줄입니다. 발행 예정 글은 맨 위에 있습니다. 「상세」에서 본문 · 원천 · 감사 기록을 봅니다.
      </p>
    </section>
  );
}
