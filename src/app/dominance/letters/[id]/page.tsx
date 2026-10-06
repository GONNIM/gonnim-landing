// ③ 수정 · 재작성 · 왼쪽에 원천, 오른쪽에 내 글.

import { timer } from "@/lib/dominance/timing";
import { TimingTag } from "@/app/dominance/_ui/TimingTag";
import { loadEditorPage } from "@/lib/dominance/page-data";
import { suggestReady } from "@/lib/dominance/llm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import {
  LETTER_STATUS_LABEL,
  LETTER_STATUS_STYLE,
} from "@/lib/dominance/types";
import { LetterEditor } from "./LetterEditor";

export const dynamic = "force-dynamic";


export default async function LetterEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 56차 D · 자료 읽기는 page-data.ts(시간 재기 라우트와 같은 함수)
  const t = timer("③ 편집");
  const { db } = await t.step("인증", dominanceContext());
  const loaded = await loadEditorPage(db, id, t);
  if (!loaded) notFound();
  const { data, sources, card, meta, mismatches, unverified } = loaded;

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
            {data.revision_count > 0 && (
              <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
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

      {unverified > 0 && (
        <p className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
          확인 전 초안 · 뜻 {unverified}개 미확인.{" "}
          {data.question_id ? (
            <Link href={`/dominance/questions/${data.question_id}/evidence`} className="font-medium underline">
              증거 표
            </Link>
          ) : (
            "증거 표"
          )}
          에서 뜻을 확인하시면 이 표시가 사라집니다.
        </p>
      )}

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
        initialMismatches={mismatches}
        meta={meta ? { titles: meta.titles, glossary: meta.glossary, generatedAt: meta.generatedAt, generation: meta.generation, titleSuggestions: meta.title_suggestions ?? null, suggestReady: suggestReady() } : null}
      />
    </div>
  );
}
