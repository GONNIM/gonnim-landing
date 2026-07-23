// /radar/insights · Sprint 시장 인텔리전스 뷰어 (P-Radar-P3)
// 사용자 Q10 정의: 트렌드 · 시장 pain · 사업 아이템 요약 및 통계·분석·결과 볼 수 있는 뷰어
// MVP 4 섹션: KPI · 주간 트렌드 · 사업 아이템 요약 · 카테고리 분포

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { CHANNEL_LABEL, formatDate } from "@/lib/radar-format";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  channel: string;
  category: string | null;
  first_seen_at: string;
  status: string;
  relevance_scores: { score: number }[] | null;
};

type ApplicationInsightRow = {
  id: string;
  project_id: string;
  business_grade: string | null;
  competition_level: string | null;
  sprint_status: string | null;
  insight_generated_at: string | null;
  projects: { title: string; channel: string; category: string | null } | null;
};

type TrendLaunchRow = {
  id: string;
  source: string;
  external_id: string;
  external_url: string;
  title: string;
  tagline: string | null;
  author: string | null;
  published_at: string | null;
  llm_business_grade: string | null;
  promoted_to_idea: boolean | null;
  first_seen_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  "product-hunt": "🌟 Product Hunt",
  "indie-hackers": "🎯 Indie Hackers",
  "show-hn": "💬 Show HN",
  "reddit-sideproject": "🔴 Reddit",
  hn: "📰 Hacker News",
  "github-trending": "🐙 GitHub",
  "hugging-face": "🤗 HF",
  medium: "📝 Medium",
  geeknews: "🇰🇷 GeekNews",
  yozm: "🇰🇷 요즘IT",
  velog: "🇰🇷 Velog",
};

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-950 text-emerald-300",
  B: "bg-sky-950 text-sky-300",
  C: "bg-amber-950 text-amber-300",
  D: "bg-neutral-800 text-neutral-400",
};

const COMP_STYLE: Record<string, string> = {
  red: "bg-red-950 text-red-300",
  yellow: "bg-amber-950 text-amber-300",
  blue: "bg-sky-950 text-sky-300",
};

const COMP_LABEL: Record<string, string> = {
  red: "🔴 Red",
  yellow: "🟡 Yellow",
  blue: "🔵 Blue",
};

const SPRINT_LABEL: Record<string, string> = {
  candidate: "◯ 후보",
  pursuing: "▶ 진행중",
  "kicked-off": "🚀 킥오프",
  dropped: "✗ 제외",
};

function weekStart(d: Date): Date {
  const dow = d.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMon);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function fmtIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function InsightsPage() {
  const supabase = await getServerAuthClient();

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select(
      "id, channel, category, first_seen_at, status, relevance_scores(score)",
    )
    .returns<ProjectRow[]>();

  const { data: apps, error: appErr } = await supabase
    .from("applications")
    .select(
      `id, project_id, business_grade, competition_level, sprint_status,
       insight_generated_at,
       projects(title, channel, category)`,
    )
    .not("business_grade", "is", null)
    .order("insight_generated_at", { ascending: false })
    .returns<ApplicationInsightRow[]>();

  // 최근 7일 IT 트렌드 launches (Product Hunt 등 · P-Insights-Ext)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trends } = await supabase
    .from("trend_launches")
    .select(
      `id, source, external_id, external_url, title, tagline, author,
       published_at, llm_business_grade, promoted_to_idea, first_seen_at`,
    )
    .gte("first_seen_at", sevenDaysAgo)
    .order("published_at", { ascending: false })
    .limit(20)
    .returns<TrendLaunchRow[]>();

  if (projErr || appErr) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-lg font-semibold text-red-300">DB 오류</h1>
        <p className="text-sm text-neutral-400">
          {projErr?.message ?? appErr?.message}
        </p>
      </div>
    );
  }

  const projList = projects ?? [];
  const appList = apps ?? [];

  // ---------- KPI ----------
  const now = new Date();
  const thisWeekStart = weekStart(now);
  const totalProjects = projList.length;
  const newThisWeek = projList.filter(
    (p) => new Date(p.first_seen_at) >= thisWeekStart,
  ).length;
  const gradeA = appList.filter((a) => a.business_grade === "A").length;
  const gradeB = appList.filter((a) => a.business_grade === "B").length;
  const pursuing = appList.filter(
    (a) => a.sprint_status === "pursuing" || a.sprint_status === "kicked-off",
  ).length;

  // ---------- 트렌드 · 지난 4주 주별 신규 (채널 stacked) ----------
  const weeks: { start: Date; label: string; byChannel: Record<string, number> }[] =
    [];
  for (let i = 3; i >= 0; i -= 1) {
    const ws = new Date(thisWeekStart);
    ws.setDate(thisWeekStart.getDate() - i * 7);
    weeks.push({
      start: ws,
      label: `${String(ws.getMonth() + 1).padStart(2, "0")}/${String(ws.getDate()).padStart(2, "0")}`,
      byChannel: {},
    });
  }
  for (const p of projList) {
    const dt = new Date(p.first_seen_at);
    for (let i = 0; i < weeks.length; i += 1) {
      const wStart = weeks[i].start;
      const wEnd =
        i + 1 < weeks.length
          ? weeks[i + 1].start
          : new Date(wStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (dt >= wStart && dt < wEnd) {
        weeks[i].byChannel[p.channel] = (weeks[i].byChannel[p.channel] ?? 0) + 1;
        break;
      }
    }
  }
  const trendMax = Math.max(
    1,
    ...weeks.map((w) =>
      Object.values(w.byChannel).reduce((a, b) => a + b, 0),
    ),
  );

  // ---------- 카테고리 분포 (Top 10) ----------
  const catMap: Record<
    string,
    { total: number; a: number; b: number }
  > = {};
  for (const p of projList) {
    const c = p.category ?? "-";
    catMap[c] = catMap[c] ?? { total: 0, a: 0, b: 0 };
    catMap[c].total += 1;
  }
  for (const a of appList) {
    const cat = a.projects?.category ?? "-";
    if (!catMap[cat]) continue;
    if (a.business_grade === "A") catMap[cat].a += 1;
    if (a.business_grade === "B") catMap[cat].b += 1;
  }
  const catTop = Object.entries(catMap)
    .map(([cat, v]) => ({ cat, ...v }))
    .sort((x, y) => y.total - x.total)
    .slice(0, 10);
  const catMax = Math.max(1, ...catTop.map((c) => c.total));

  // ---------- 사업 아이템 요약 Top 5 (A·B 등급 · 최신) ----------
  const topIdeas = appList
    .filter((a) => a.business_grade === "A" || a.business_grade === "B")
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          🔍 시장 인텔리전스
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          트렌드 · 시장 pain · 사업 아이템 후보 요약 · 통계 · 분석 (원본 링크
          포함) · 사용자 Q10 정의
        </p>
      </div>

      {/* §1 · 요약 KPI */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="총 프로젝트" value={totalProjects.toLocaleString()} />
        <Kpi label="이번주 신규" value={newThisWeek.toLocaleString()} tone="sky" />
        <Kpi label="A 등급" value={gradeA.toLocaleString()} tone="emerald" />
        <Kpi label="B 등급" value={gradeB.toLocaleString()} tone="sky" />
        <Kpi label="Sprint 진행" value={pursuing.toLocaleString()} tone="emerald" />
      </section>

      {/* §2 · 주간 트렌드 (채널 stacked bar · ASCII) */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            📈 주간 트렌드 · 신규 프로젝트 (지난 4주)
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            월요일 기준 주 경계 · 채널별 stacked
          </p>
        </div>
        <div className="space-y-2">
          {weeks.map((w) => {
            const total = Object.values(w.byChannel).reduce((a, b) => a + b, 0);
            return (
              <div key={w.label} className="flex items-center gap-3 text-xs">
                <span className="w-16 text-neutral-500">{w.label}~</span>
                <div className="flex-1">
                  <div className="flex h-5 overflow-hidden rounded bg-neutral-950">
                    {Object.entries(w.byChannel).map(([ch, n]) => {
                      const pct = (n / trendMax) * 100;
                      const bg =
                        ch === "wanted-gigs"
                          ? "bg-emerald-800"
                          : ch === "wishket"
                            ? "bg-sky-800"
                            : "bg-neutral-700";
                      return (
                        <div
                          key={ch}
                          className={`${bg} flex items-center justify-center text-[10px] text-white`}
                          style={{ width: `${pct}%` }}
                          title={`${CHANNEL_LABEL[ch] ?? ch}: ${n}건`}
                        >
                          {pct > 8 ? n : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <span className="w-10 text-right text-neutral-400">{total}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-emerald-800"></span> 원티드
            긱스
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-sky-800"></span> 위시켓
          </span>
        </div>
      </section>

      {/* §3 · 사업 아이템 요약 (Top 5) */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              🔥 사업 아이템 요약 (A·B 등급 Top 5)
            </h2>
            <p className="mt-1 text-[11px] text-neutral-500">
              전체 큐레이션 →{" "}
              <Link
                href="/radar/business-ideas"
                className="text-sky-400 hover:underline"
              >
                /radar/business-ideas
              </Link>
            </p>
          </div>
        </div>
        {topIdeas.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-800 bg-neutral-950/40 p-4 text-xs text-neutral-500">
            사업화 분석 완료된 A·B 등급 프로젝트 없음
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {topIdeas.map((a) => {
              const p = a.projects;
              if (!p) return null;
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.business_grade && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${GRADE_STYLE[a.business_grade] ?? ""}`}
                      >
                        {a.business_grade}
                      </span>
                    )}
                    {a.competition_level && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${COMP_STYLE[a.competition_level] ?? ""}`}
                      >
                        {COMP_LABEL[a.competition_level] ?? a.competition_level}
                      </span>
                    )}
                    {a.sprint_status && (
                      <span className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-300">
                        {SPRINT_LABEL[a.sprint_status] ?? a.sprint_status}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                      {CHANNEL_LABEL[p.channel] ?? p.channel}
                    </span>
                  </div>
                  <Link
                    href={`/radar/project/${a.project_id}`}
                    className="mt-1 block truncate text-sm text-neutral-100 hover:text-white"
                  >
                    {p.title}
                  </Link>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {p.category ?? "카테고리 -"} · 분석{" "}
                    {formatDate(a.insight_generated_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* §3.5 · 최근 IT 트렌드 launches (Product Hunt 등) */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            🌟 최근 IT 트렌드 (지난 7일)
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            Product Hunt 등 원천 자동 수집 · Wiki `Thoughts/Trends/` 저장 · 원본 링크 포함
          </p>
        </div>
        {(trends ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-800 bg-neutral-950/40 p-4 text-xs text-neutral-500">
            트렌드 launch 없음 · 크롤러 09:30 KST 자동 실행 대기
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(trends ?? []).map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 transition hover:border-neutral-600"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                    {SOURCE_LABEL[t.source] ?? t.source}
                  </span>
                  {t.llm_business_grade && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${GRADE_STYLE[t.llm_business_grade] ?? ""}`}
                    >
                      {t.llm_business_grade}
                    </span>
                  )}
                  {t.promoted_to_idea && (
                    <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      💡 Ideas 승격
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-600">
                    {formatDate(t.published_at)}
                  </span>
                </div>
                <a
                  href={t.external_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1.5 block truncate text-sm font-medium text-neutral-100 hover:text-white"
                >
                  {t.title}
                </a>
                {t.tagline && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-neutral-400">
                    {t.tagline}
                  </p>
                )}
                {t.author && (
                  <p className="mt-1 text-[10px] text-neutral-600">
                    by {t.author}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* §4 · 카테고리 분포 (Top 10) */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            🏷 카테고리 분포 (Top 10)
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            프로젝트 수 · A/B 등급 표시 · 다양성 관찰
          </p>
        </div>
        <div className="space-y-2">
          {catTop.map((c) => {
            const pct = (c.total / catMax) * 100;
            return (
              <div key={c.cat} className="flex items-center gap-3 text-xs">
                <span
                  className="w-32 truncate text-neutral-400"
                  title={c.cat}
                >
                  {c.cat}
                </span>
                <div className="flex-1">
                  <div className="flex h-5 overflow-hidden rounded bg-neutral-950">
                    <div
                      className="flex items-center justify-end bg-neutral-700 pr-1 text-[10px] text-white"
                      style={{ width: `${pct}%` }}
                    >
                      {c.total}
                    </div>
                  </div>
                </div>
                <span className="w-14 text-right text-[10px] text-neutral-500">
                  {c.a > 0 && <span className="text-emerald-400">A{c.a} </span>}
                  {c.b > 0 && <span className="text-sky-400">B{c.b}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-neutral-600">
        후속: 시장 pain LLM 판정 · Wiki `Trends/`·`Ideas/` 노트 연계 · Phase 확장
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "sky" | "emerald";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "sky"
        ? "text-sky-300"
        : "text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
