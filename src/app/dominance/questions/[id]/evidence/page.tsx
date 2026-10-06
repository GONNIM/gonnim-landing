// ② 증거 표 · 질문 하나의 재료 네 칸과 사실 문장 (D26 · D33 · D37 · D43).
//
// 문장은 원문과 글자 그대로 대조한 것만 들어간다. 채택한 질문이고 3칸 이상 차면 [글 작성하기] 가 열린다(20차).

import { timer } from "@/lib/dominance/timing";
import { TimingTag } from "@/app/dominance/_ui/TimingTag";
import { loadEvidencePage } from "@/lib/dominance/page-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { EvidenceBoard } from "./EvidenceBoard";

export const dynamic = "force-dynamic";
// [증거 모으기] 한 단계가 Europe PMC 여러 번과 LLM 1회를 부른다.
export const maxDuration = 300;

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 56차 D · 자료 읽기는 page-data.ts(시간 재기 라우트와 같은 함수)
  const t = timer("② 증거 표");
  const { db } = await t.step("인증", dominanceContext());
  const { q, table: tbl, letter, usedIds, prevById } = await loadEvidencePage(db, id, t);
  if (!q || !tbl) notFound();
  const table = tbl;

  return (
    <div className="space-y-6">
      <TimingTag t={t} />
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex gap-3">
            <Link href="/dominance/questions" className="text-xs text-muted-foreground hover:text-foreground">
              ← ① 이슈 고르기
            </Link>
            <Link href="/dominance/evidence" className="text-xs text-muted-foreground hover:text-foreground">
              ← ② 증거·뜻
            </Link>
          </span>
          {/* 42차 C · 글이 있으면 편집 화면으로 바로 간다(「초안 열기」 는 진행 상자 안에 있어 멀다) */}
          {letter && (
            <Link
              href={`/dominance/letters/${letter.id}`}
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
            >
              ③ 편집 화면 →
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">② 증거 표</h1>
        <p className="mt-2 text-base font-medium text-foreground">{q.question}</p>
        {(q.premise || q.twist) && (
          <p className="mt-1 text-sm text-foreground">
            통설 · {q.premise ?? "—"}
            <br />
            되묻기 · {q.twist ?? "—"}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          영역 {q.area ?? "—"} · 계열 {q.series ?? "—"} · 검색어 {q.searchQueries.join(" / ")}
        </p>
      </div>
      {!table.extColumns && (
        <p className="rounded-lg border border-dashed border-amber-500/40 p-3 text-xs text-muted-foreground">
          4단계 SQL 전입니다. 문장의 대상 · 연도 · 수치 · 대조 시각은 메모 칸 끝에 임시로 적습니다(런북 10번).
        </p>
      )}
      <EvidenceBoard
        questionId={q.id}
        status={q.status}
        table={table}
        run={q.evidenceRun as never}
        letter={letter ?? null}
        usedIds={usedIds}
        prevById={prevById}
      />
    </div>
  );
}
