// 독자 반응 4층 (D42 · 26차 C-4) · 레터별 숫자만 본다. 사람 단위 기록은 없다.

import { dominanceContext } from "@/lib/dominance/guard";
import {
  CLICK_KINDS,
  CLICK_LABEL,
  clickKindsOf,
  hasClickKindsColumn,
  REACT_LABEL,
  votesOf,
  type ReactionRow,
} from "@/lib/dominance/reactions";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import { RepliesInput } from "./RepliesInput";

export const dynamic = "force-dynamic";

type Letter = { id: string; title: string; status: string; published_at: string | null; sent_count: number | null };

export default async function ReactionsPage() {
  const { db } = await dominanceContext();
  const col = await hasClickKindsColumn(db);
  const { data, error } = await db.from("ds_letter_reactions").select(col ? "*, click_kinds" : "*");
  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }
  const rows = (data ?? []) as unknown as ReactionRow[];
  const { data: published } = await db
    .from("ds_letters")
    .select("id, title, status, published_at, sent_count")
    .or(`status.eq.published,id.in.(${rows.map((r) => r.letter_id).join(",") || "00000000-0000-0000-0000-000000000000"})`)
    .order("published_at", { ascending: false, nullsFirst: false });
  const letters = (published ?? []) as Letter[];
  const voteIds = [...new Set(rows.flatMap((r) => Object.keys(votesOf(r))))];
  const { data: qs } = voteIds.length ? await db.from("ds_questions").select("id, question").in("id", voteIds) : { data: [] };
  const qText = new Map(((qs ?? []) as { id: string; question: string }[]).map((q) => [q.id, q.question]));

  return (
    <div className="space-y-6">
      <Heading />
      {!col && (
        <p className="rounded-lg border border-dashed border-amber-500/40 p-3 text-xs text-muted-foreground">
          클릭 종류 칸 SQL(런북) 전입니다. 클릭 종류는 투표 칸의 예약 키에 임시로 셉니다. 화면은 같습니다.
        </p>
      )}
      {letters.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 반응이 쌓인 글이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[color:var(--border)]">
                <th className="py-2 pr-3">글</th>
                <th className="py-2 pr-3">발송</th>
                <th className="py-2 pr-3">① 열람 · 클릭(종류)</th>
                <th className="py-2 pr-3">② 끝 도달</th>
                <th className="py-2 pr-3">③ 반응</th>
                <th className="py-2 pr-3">④ 투표 · 답장</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => {
                const r = rows.find((x) => x.letter_id === l.id);
                const kinds = r ? clickKindsOf(r) : {};
                const votes = r ? votesOf(r) : {};
                return (
                  <tr key={l.id} className="border-b border-[color:var(--border)]/50 align-top">
                    <td className="py-2 pr-3">
                      <span className="text-foreground/90">{l.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {l.status}
                        {l.published_at ? ` · ${l.published_at.slice(0, 10)}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{l.sent_count ?? "—"}</td>
                    <td className="py-2 pr-3">
                      열람 {r?.opens ?? 0} · 클릭 {r?.clicks ?? 0}
                      <span className="block text-[11px] text-muted-foreground">
                        {CLICK_KINDS.filter((k) => kinds[k]).map((k) => `${CLICK_LABEL[k]} ${kinds[k]}`).join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{r?.end_reached ?? 0}</td>
                    <td className="py-2 pr-3">
                      {REACT_LABEL.new} {r?.react_new ?? 0}
                      <br />
                      {REACT_LABEL.known} {r?.react_known ?? 0}
                      <br />
                      {REACT_LABEL.more} {r?.react_more ?? 0}
                    </td>
                    <td className="py-2 pr-3">
                      {Object.entries(votes).length === 0 ? (
                        <span className="text-muted-foreground">투표 없음</span>
                      ) : (
                        Object.entries(votes)
                          .sort((a, b) => b[1] - a[1])
                          .map(([id, n]) => (
                            <span key={id} className="block">
                              {n} · {qText.get(id) ?? id.slice(0, 8)}
                            </span>
                          ))
                      )}
                      <span className="mt-1 block">
                        답장 <RepliesInput letterId={l.id} value={r?.replies ?? 0} />
                      </span>
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
      <h1 className="text-2xl font-semibold tracking-tight">반응</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        글마다 숫자만 셉니다. 누가 눌렀는지는 저장하지 않습니다. 같은 사람의 두 번째 반응은 해시로 막습니다.
      </p>
    </section>
  );
}
