// ③ 수정 · 재작성 · 왼쪽에 원천, 오른쪽에 내 글.

import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { loadLetterSources } from "@/lib/dominance/letters";
import { loadQuestionCard } from "@/lib/dominance/card";
import { readDraftMeta } from "@/lib/dominance/draft-store";
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
  question_id: string | null;
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
    .select("id, title, summary, blocks, status, revision_count, question_id")
    .eq("id", id)
    .maybeSingle<Row>();

  if (!data) notFound();

  const sources = await loadLetterSources(db, id);
  // 질문에서 나온 글(20차)은 왼쪽에 사실 카드를 둔다. 옛 글은 원천 초록을 둔다.
  const card = data.question_id ? await loadQuestionCard(db, data.question_id) : null;
  const meta = data.question_id ? await readDraftMeta(db, id) : null;

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
        card={
          card
            ? {
                questionId: card.question.id,
                facts: card.facts,
                sources: card.sources,
                vLine: card.vLine,
                tags: card.tags,
              }
            : null
        }
        meta={meta ? { titles: meta.titles, glossary: meta.glossary, generatedAt: meta.generatedAt, generation: meta.generation } : null}
      />
    </div>
  );
}
