// 옛 후보(기록) · 읽기 전용 (D24 · 27차 E-1).
//
// 2026-09-29 부터 논문 단위 후보를 만들지 않는다. 후보 생성 코드(score · candidates · 옛 draft)는 27차에 지웠다.
// ds_candidates 의 데이터는 지우지 않고 여기서 읽기만 한다. 초안 만들기 · 제외 버튼은 없다.

import { dominanceContext } from "@/lib/dominance/guard";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import { AGENCY_LABEL, SOURCE_LABEL } from "@/lib/dominance/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  candidate_date: string;
  headline: string;
  hook: string | null;
  score: number;
  state: string;
  paper: { source: string; landing_url: string } | null;
  gov_press: { agency: string; landing_url: string } | null;
};

const SELECT = `
  id, candidate_date, headline, hook, score, state,
  paper:ds_papers!ds_candidates_paper_id_fkey ( source, landing_url ),
  gov_press:ds_gov_press!ds_candidates_gov_press_id_fkey ( agency, landing_url )
`;

const STATE_LABEL: Record<string, string> = { open: "열림", drafted: "초안 만듦", used: "발행에 씀", excluded: "제외" };

export default async function CandidatesPage() {
  const { db } = await dominanceContext();
  const { data, error } = await db
    .from("ds_candidates")
    .select(SELECT)
    .order("candidate_date", { ascending: false })
    .order("score", { ascending: false })
    .limit(200);

  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading count={0} />
        <SchemaNotice />
      </div>
    );
  }
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <Heading count={rows.length} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const src = r.paper
              ? { label: SOURCE_LABEL[r.paper.source] ?? r.paper.source, url: r.paper.landing_url }
              : r.gov_press
                ? { label: AGENCY_LABEL[r.gov_press.agency] ?? r.gov_press.agency, url: r.gov_press.landing_url }
                : null;
            return (
              <li key={r.id} className="rounded-lg border border-[color:var(--border)]/60 p-3 text-sm">
                <p className="text-foreground/90">{r.headline}</p>
                {r.hook && <p className="mt-1 text-xs text-muted-foreground">{r.hook}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.candidate_date} · 점수 {r.score} · {STATE_LABEL[r.state] ?? r.state}
                  {src && (
                    <>
                      {" · "}
                      <a href={src.url} className="underline" target="_blank" rel="noreferrer">
                        {src.label}
                      </a>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Heading({ count }: { count: number }) {
  return (
    <section>
      <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
        옛 방식의 후보 기록입니다(읽기 전용). 2026-09-29 부터 새 후보를 만들지 않습니다. 이슈는{" "}
        <a href="/dominance/questions" className="underline">① 이슈 고르기</a>에서 고릅니다.
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">옛 후보(기록)</h1>
      <p className="mt-1 text-sm text-muted-foreground">최근 200건 · 모두 {count}건 표시</p>
    </section>
  );
}
