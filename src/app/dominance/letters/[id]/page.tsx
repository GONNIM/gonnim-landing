// ③ 수정 · 재작성 · 왼쪽에 원천, 오른쪽에 내 글.

import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { loadLetterSources } from "@/lib/dominance/letters";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
  type LetterBlock,
  type LetterStatus,
} from "@/lib/dominance/types";
import { LetterEditor } from "./LetterEditor";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  summary: string | null;
  blocks: LetterBlock[];
  status: LetterStatus;
  revision_count: number;
};

export default async function LetterEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await dominanceContext();

  const { data } = await db
    .from("ds_letters")
    .select("id, title, summary, blocks, status, revision_count")
    .eq("id", id)
    .maybeSingle<Row>();

  if (!data) notFound();

  const sources = await loadLetterSources(db, id);

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
            {data.revision_count > 0 && (
              <span className="text-xs text-amber-300/80">
                리뷰에서 되돌아온 횟수 {data.revision_count}회
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {data.title}
          </h1>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/dominance/letters"
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground/85 hover:border-[color:var(--accent)]"
          >
            ◀ 글 목록
          </Link>
          {data.status !== "draft" && (
            <Link
              href={`/dominance/review/${id}`}
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground/85 hover:border-[color:var(--accent)]"
            >
              리뷰 화면 →
            </Link>
          )}
        </div>
      </section>

      {data.status !== "draft" && (
        <p className="rounded-lg border border-[color:var(--border)]/70 bg-surface/40 p-3 text-sm text-muted-foreground">
          이 글은 이미 리뷰 단계로 올라갔습니다. 고치시려면 리뷰 화면에서 [수정으로
          되돌리기] 를 누르십시오.
        </p>
      )}

      <LetterEditor
        letterId={id}
        status={data.status}
        initialTitle={data.title}
        initialSummary={data.summary ?? ""}
        initialBlocks={data.blocks}
        sources={sources}
      />
    </div>
  );
}
