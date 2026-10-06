// ④ 리뷰 화면 · 왼쪽에 글, 오른쪽에 점검 결과. 여기서는 글을 고치지 않는다.

import { timer } from "@/lib/dominance/timing";
import { TimingTag } from "@/app/dominance/_ui/TimingTag";
import { loadReviewPage } from "@/lib/dominance/page-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { charCount, readingMinutes } from "@/lib/dominance/render";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
} from "@/lib/dominance/types";
import { ReviewPanel } from "./ReviewPanel";
import { TitleSummaryEditor } from "./TitleSummaryEditor";
import { suggestReady } from "@/lib/dominance/llm";

export const dynamic = "force-dynamic";


export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 56차 D · 자료 읽기는 page-data.ts(시간 재기 라우트와 같은 함수)
  const t = timer("④ 리뷰");
  const { db } = await t.step("인증", dominanceContext());
  const loaded = await loadReviewPage(db, id, t);
  if (!loaded) notFound();
  const { data, sources, checks, meaning, draftMeta } = loaded;
  // 48차 A · D51 · 리뷰 대기 · 리뷰 통과 글은 제목 · 요약만 여기서 고칠 수 있다
  const titleEditable = data.status === "review" || data.status === "reviewed";

  return (
    <div className="space-y-6">
      <TimingTag t={t} />
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
              <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
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

      {titleEditable && (
        <TitleSummaryEditor
          letterId={id}
          initialTitle={data.title}
          initialSummary={data.summary ?? ""}
          suggestReady={suggestReady()}
          suggestions={draftMeta?.title_suggestions ?? null}
        />
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
        savedRuns={data.review_checks?.crossReviewRuns ?? null}
        meaning={meaning.applicable ? { used: meaning.used, verified: meaning.verified } : null}
      />
    </div>
  );
}
