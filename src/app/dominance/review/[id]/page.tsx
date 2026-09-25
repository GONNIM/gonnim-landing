// ④ 리뷰 화면 · 왼쪽에 글, 오른쪽에 점검 결과. 여기서는 글을 고치지 않는다.

import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { loadLetterSources } from "@/lib/dominance/letters";
import { runReviewChecks } from "@/lib/dominance/review";
import { charCount, readingMinutes } from "@/lib/dominance/render";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
  type LetterBlock,
  type LetterStatus,
  type ReviewChecks,
} from "@/lib/dominance/types";
import { ReviewPanel } from "./ReviewPanel";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  status: LetterStatus;
  review_checks: ReviewChecks | null;
  revision_count: number;
};

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await dominanceContext();

  const { data } = await db
    .from("ds_letters")
    .select(
      "id, title, summary, blocks, status, review_checks, revision_count",
    )
    .eq("id", id)
    .maybeSingle<Row>();

  if (!data) notFound();

  const sources = await loadLetterSources(db, id);

  // 화면을 열 때마다 다시 점검한다. 자동 점검은 돈이 들지 않는다.
  const checks = await runReviewChecks({
    blocks: data.blocks,
    sourceUrls: sources.map((s) => s.url),
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${LETTER_STATUS_STYLE[data.status]}`}
            >
              {LETTER_STATUS_LABEL[data.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              {charCount(data.blocks).toLocaleString()}자 · 읽는 시간 약{" "}
              {readingMinutes(data.blocks)}분
            </span>
            {data.revision_count > 0 && (
              <span className="text-xs text-amber-300/80">
                되돌린 횟수 {data.revision_count}회
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {data.title}
          </h1>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/dominance/review"
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground/85 hover:border-[color:var(--accent)]"
          >
            ◀ 리뷰 목록
          </Link>
          <Link
            href={`/dominance/letters/${id}`}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground/85 hover:border-[color:var(--accent)]"
          >
            편집 화면 →
          </Link>
        </div>
      </section>

      {data.status !== "review" && (
        <p className="rounded-lg border border-[color:var(--border)]/70 bg-surface/40 p-3 text-sm text-muted-foreground">
          이 글은 리뷰 대기 상태가 아닙니다. 점검 결과는 볼 수 있지만 [리뷰 통과]
          는 누를 수 없습니다.
        </p>
      )}

      <ReviewPanel
        letterId={id}
        status={data.status}
        title={data.title}
        summary={data.summary}
        blocks={data.blocks}
        sources={sources.map((s) => ({
          label: s.label,
          title: s.title,
          url: s.url,
          license: s.attribution ?? s.licenseLabel,
        }))}
        checks={checks}
        savedCrossReview={data.review_checks?.crossReview ?? null}
      />
    </div>
  );
}
