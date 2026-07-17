// Radar dashboard home · today's projects + funnel snapshot.

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  "wanted-gigs": "원티드 긱스",
  wishket: "위시켓",
  kmong: "크몽",
  upwork: "Upwork",
  toptal: "Toptal",
};

const CONTRACT_LABEL: Record<string, string> = {
  outsourcing: "외주(도급)",
  contractor: "기간제(상주)",
  "part-time": "파트타임",
};

const FUNNEL_LABEL: Record<string, string> = {
  interested: "관심",
  drafting: "초안 작성",
  applied: "지원 완료",
  responded: "응답 받음",
  meeting: "미팅 예정",
  contracted: "계약",
  rejected: "거절",
  expired: "만료",
};

function formatKRW(n: number | null | undefined) {
  if (n == null) return "-";
  return `${(n / 10000).toLocaleString()}만원`;
}

function formatRelativeDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

type ProjectRow = {
  id: string;
  channel: string;
  external_url: string;
  title: string;
  category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  duration_days: number | null;
  contract_type: string | null;
  applicants_count: number | null;
  location: string | null;
  posted_at: string | null;
  deadline_at: string | null;
  first_seen_at: string;
  relevance_scores: { score: number; score_breakdown: unknown }[] | null;
};

export default async function RadarHome() {
  const supabase = await getServerAuthClient();

  // 오늘 신규 프로젝트 · 정합도 상위 10건
  const { data: topProjects, error: topError } = await supabase
    .from("projects")
    .select(
      `id, channel, external_url, title, category, budget_min, budget_max,
       duration_days, contract_type, applicants_count, location, posted_at,
       deadline_at, first_seen_at,
       relevance_scores(score, score_breakdown)`,
    )
    .eq("status", "active")
    .order("first_seen_at", { ascending: false })
    .limit(30)
    .returns<ProjectRow[]>();

  const rows = (topProjects ?? [])
    .map((p) => ({
      ...p,
      relevance: p.relevance_scores?.[0]?.score ?? 0,
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 10);

  const { count: totalActive } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  // Applications funnel
  const { data: apps } = await supabase
    .from("applications")
    .select("status");

  const funnel: Record<string, number> = {};
  for (const s of Object.keys(FUNNEL_LABEL)) funnel[s] = 0;
  for (const row of apps ?? []) funnel[row.status] = (funnel[row.status] ?? 0) + 1;

  // Latest crawl per channel
  const { data: latestCrawls } = await supabase
    .from("crawl_logs")
    .select("channel, ended_at, projects_found, new_projects, status")
    .order("started_at", { ascending: false })
    .limit(10);

  const latestByChannel = new Map<
    string,
    { ended_at: string | null; new_projects: number; status: string | null }
  >();
  for (const c of latestCrawls ?? []) {
    if (!latestByChannel.has(c.channel)) {
      latestByChannel.set(c.channel, {
        ended_at: c.ended_at,
        new_projects: c.new_projects,
        status: c.status,
      });
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          오늘의 프로젝트 레이더
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          정합도 상위 10건 · 재직 병행 조건 (외주·원격) 우선 노출
        </p>
      </section>

      {/* Top cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="활성 프로젝트"
          value={`${totalActive ?? 0}건`}
          hint="Supabase에 저장된 채널 통합"
        />
        <Card
          label="지원 진행"
          value={`${
            funnel.drafting + funnel.applied + funnel.responded + funnel.meeting
          }건`}
          hint="관심 · 초안 · 응답 · 미팅 합계"
        />
        <Card
          label="이번주 계약"
          value={`${funnel.contracted}건`}
          hint="Weekly-Ops 반영"
        />
        <Card
          label="Top 정합도"
          value={rows[0] ? `${rows[0].relevance}/10` : "-"}
          hint={rows[0]?.title ?? "데이터 없음"}
        />
      </section>

      {/* Channels */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-sm font-medium text-neutral-300">채널 최근 크롤</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Object.entries(CHANNEL_LABEL).map(([key, label]) => {
            const c = latestByChannel.get(key);
            return (
              <div
                key={key}
                className="rounded-lg border border-neutral-800/70 bg-neutral-950 p-3"
              >
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="mt-1 text-sm text-neutral-200">
                  {c ? (
                    <>
                      +{c.new_projects} · {formatRelativeDate(c.ended_at)}
                    </>
                  ) : (
                    "미실행"
                  )}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">
                  {c?.status ?? "waiting"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top projects */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">오늘의 프로젝트 Top 10</h2>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            아직 수집된 프로젝트가 없습니다.<br />
            <span className="text-neutral-600">
              GET /api/cron/crawl-wishket 을 실행해 초기 데이터를 채워주세요.
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800 bg-neutral-900/30">
            {rows.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={p.relevance} />
                      <span className="text-xs uppercase tracking-wide text-neutral-500">
                        {CHANNEL_LABEL[p.channel] ?? p.channel}
                      </span>
                      {p.contract_type && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                            p.contract_type === "outsourcing"
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {CONTRACT_LABEL[p.contract_type] ?? p.contract_type}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/radar/project/${p.id}`}
                      className="mt-1 block truncate text-base font-medium text-neutral-100 hover:text-white"
                    >
                      {p.title}
                    </Link>
                    <p className="mt-1 text-xs text-neutral-500">
                      {p.category ?? "카테고리 -"} · 예산 {formatKRW(p.budget_min)}
                      {p.budget_max && p.budget_max !== p.budget_min
                        ? ` ~ ${formatKRW(p.budget_max)}`
                        : ""}
                      · 기간 {p.duration_days ?? "-"}일 · 지원자{" "}
                      {p.applicants_count ?? 0}명 · {p.location ?? "-"}
                    </p>
                  </div>
                  <a
                    href={p.external_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
                  >
                    원 페이지 ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        {topError && (
          <p className="text-xs text-red-400">Supabase 오류: {topError.message}</p>
        )}
      </section>

      {/* Funnel */}
      <section>
        <h2 className="text-lg font-medium">지원 Funnel</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Object.entries(FUNNEL_LABEL).map(([key, label]) => (
            <div
              key={key}
              className="rounded-lg border border-neutral-800/70 bg-neutral-950 p-3"
            >
              <p className="text-xs text-neutral-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-neutral-100">
                {funnel[key]}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-neutral-100">{value}</p>
      <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 7
      ? "bg-emerald-500/20 text-emerald-300"
      : score >= 4
        ? "bg-amber-500/20 text-amber-300"
        : "bg-neutral-800 text-neutral-400";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      ★ {score}/10
    </span>
  );
}
