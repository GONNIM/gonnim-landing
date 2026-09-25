// ① 이슈 목록 · 오늘 후보와 재고를 보여주고, 체크한 것으로 초안을 만든다.
//
// 안 고르면 재고로 남고 그 주에는 발행이 없다. 그것이 정상 경로다 —
// 매일 해야 하는 일을 만들지 않는 것이 첫 4주를 넘기는 조건이다.

import { dominanceContext } from "@/lib/dominance/guard";
import { kstToday } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";
import { AGENCY_LABEL, SOURCE_LABEL, type ScoreBreakdown } from "@/lib/dominance/types";
import { CandidatePicker, type CandidateCard } from "./CandidatePicker";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  candidate_date: string;
  headline: string;
  hook: string | null;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  state: string;
  paper: {
    source: string;
    landing_url: string;
    published_date: string | null;
  } | null;
  gov_press: {
    agency: string;
    landing_url: string;
    published_date: string | null;
  } | null;
};

const SELECT = `
  id, candidate_date, headline, hook, score, score_breakdown, state,
  paper:ds_papers!ds_candidates_paper_id_fkey ( source, landing_url, published_date ),
  gov_press:ds_gov_press!ds_candidates_gov_press_id_fkey ( agency, landing_url, published_date )
`;

function toCard(r: Row): CandidateCard {
  const origin = r.paper
    ? {
        label: SOURCE_LABEL[r.paper.source] ?? r.paper.source,
        url: r.paper.landing_url,
        date: r.paper.published_date,
      }
    : r.gov_press
      ? {
          label: AGENCY_LABEL[r.gov_press.agency] ?? r.gov_press.agency,
          url: r.gov_press.landing_url,
          date: r.gov_press.published_date,
        }
      : { label: "원천 없음", url: null, date: null };

  return {
    id: r.id,
    headline: r.headline,
    hook: r.hook,
    score: r.score,
    breakdown: r.score_breakdown,
    landingUrl: origin.url,
    sourceLabel: origin.label,
    publishedDate: origin.date,
  };
}

export default async function CandidatesPage() {
  const { db } = await dominanceContext();
  const today = kstToday();

  const { data, error } = await db
    .from("ds_candidates")
    .select(SELECT)
    .eq("state", "open")
    .order("candidate_date", { ascending: false })
    .order("score", { ascending: false })
    .limit(60);

  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice />
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const todayRows = rows.filter((r) => r.candidate_date === today);
  const stockRows = rows.filter((r) => r.candidate_date !== today);

  return (
    <div className="space-y-8">
      <Heading />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
          후보가 없습니다. 수집 크론이 매일 07시(KST)에 채웁니다.
        </div>
      ) : (
        <>
          <Section
            title={`오늘 후보 ${todayRows.length}건`}
            hint={`${today} 기준`}
            cards={todayRows.map(toCard)}
          />
          {stockRows.length > 0 && (
            <Section
              title={`재고 ${stockRows.length}건`}
              hint="지난 날 후보 · 버리지 않는다"
              cards={stockRows.map(toCard)}
            />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  cards,
}: {
  title: string;
  hint: string;
  cards: CandidateCard[];
}) {
  if (cards.length === 0) {
    return (
      <section className="space-y-3">
        <SectionHead title={title} hint={hint} />
        <p className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-6 text-center text-sm text-muted-foreground">
          없습니다.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionHead title={title} hint={hint} />
      <CandidatePicker cards={cards} />
    </section>
  );
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">① 이슈 고르기</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        역설 한 줄을 먼저 읽으십시오. 그 줄에 흥미가 없으면 나머지는 보실 필요가
        없습니다. 아무것도 안 고르셔도 됩니다.
      </p>
    </section>
  );
}
