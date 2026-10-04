// 48차 H · D53 · ② 증거·뜻 · 증거 행이 있는 질문을 한곳에 모은다.
//
// 글이 있는 질문은 「글에 쓰인 문장」의 뜻 확인 수(D50 · meaningStatus)를 보이고, 미확인이 많은 순으로 둔다.
// 글이 없는 질문은 발행 승인 조건(D50)상 지금 확인할 것이 없으므로 접힌 칸에 둔다. 증거 표 자체는 질문마다 그대로다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { meaningStatus } from "@/lib/dominance/card";
import { loadQuestions, STATUS_LABEL } from "@/lib/dominance/questions";
import { LETTER_STATUS_LABEL, type LetterStatus } from "@/lib/dominance/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  question: string;
  status: string;
  facts: number;
  letter: { id: string; title: string; status: LetterStatus } | null;
  used: number;
  verified: number;
};

export default async function EvidenceIndex() {
  const { db } = await dominanceContext();
  const { questions } = await loadQuestions(db);
  const withEvidence = questions.filter((q) => q.factCount > 0 || q.slotsFilled > 0);

  const { data: letters } = await db
    .from("ds_letters")
    .select("id, title, status, question_id, updated_at")
    .not("question_id", "is", null)
    .order("updated_at", { ascending: false });
  const letterOf = new Map<string, { id: string; title: string; status: LetterStatus }>();
  for (const l of (letters ?? []) as { id: string; title: string; status: LetterStatus; question_id: string }[]) {
    if (!letterOf.has(l.question_id)) letterOf.set(l.question_id, { id: l.id, title: l.title, status: l.status });
  }

  const rows: Row[] = [];
  for (const q of withEvidence) {
    const letter = letterOf.get(q.id) ?? null;
    const m = letter ? await meaningStatus(db, letter.id) : null;
    rows.push({
      id: q.id,
      question: q.question,
      status: STATUS_LABEL[q.status],
      facts: q.factCount,
      letter,
      used: m?.applicable ? m.used : 0,
      verified: m?.applicable ? m.verified : 0,
    });
  }
  const main = rows.filter((r) => r.letter).sort((a, b) => b.used - b.verified - (a.used - a.verified));
  const idle = rows.filter((r) => !r.letter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">② 증거·뜻</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          사실 카드와 한국어 뜻을 확인하는 곳입니다. 글에 쓰인 문장의 뜻을 모두 확인해야 발행을 승인할 수 있습니다(D50).
        </p>
      </div>

      {main.length === 0 ? (
        <p className="text-sm text-muted-foreground">글이 있는 질문이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]/60 rounded-lg border border-[color:var(--border)]/70">
          {main.map((r) => (
            <EvidenceRow key={r.id} r={r} />
          ))}
        </ul>
      )}

      {idle.length > 0 && (
        <details className="rounded-lg border border-[color:var(--border)]/70">
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted-foreground">확인할 것이 없는 질문 {idle.length}개</summary>
          <ul className="divide-y divide-[color:var(--border)]/60 border-t border-[color:var(--border)]/60">
            {idle.map((r) => (
              <EvidenceRow key={r.id} r={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EvidenceRow({ r }: { r: Row }) {
  const short = r.used > 0 && r.verified < r.used;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{r.question}</p>
        <p className="text-xs text-muted-foreground">
          {r.letter ? `${r.letter.title} · ${LETTER_STATUS_LABEL[r.letter.status]}` : `글 없음 · 질문 ${r.status}`} · 카드 {r.facts}문장
        </p>
        {r.letter && r.used > 0 && (
          <p className={`text-xs ${short ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            글에 쓰인 문장 {r.used}개 중 확인 {r.verified}개
          </p>
        )}
      </div>
      <Link
        href={`/dominance/questions/${r.id}/evidence`}
        className="shrink-0 rounded-md border border-[color:var(--border)] px-3 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
      >
        증거 표 →
      </Link>
    </li>
  );
}
