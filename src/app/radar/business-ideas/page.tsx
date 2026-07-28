// /radar/business-ideas · A/B 등급 사업 아이템 큐레이션
// Sprint status 필터 (기본: 미결정 + candidate)
// 카드 UI · 판정 배지 · Verdict 한 줄 · 상세 링크

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { CHANNEL_LABEL, formatDate } from "@/lib/radar-format";
import wikiIdeasData from "@/data/wiki-ideas.json";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Row = {
  id: string;
  sprint_status: string | null;
  sprint_decided_at: string | null;
  competition_level: string | null;
  business_grade: string | null;
  insight_generated_at: string | null;
  projects: {
    id: string;
    channel: string;
    title: string;
    category: string | null;
    contract_type: string | null;
    work_type: string | null;
    budget_min: number | null;
    budget_max: number | null;
    duration_days: number | null;
    external_url: string;
    first_seen_at: string;
  } | null;
};

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-950 text-emerald-300",
  B: "bg-sky-950 text-sky-300",
  C: "bg-amber-950 text-amber-300",
  D: "bg-[color:var(--muted)]/20 text-muted-foreground",
};

const COMPETITION_STYLE: Record<string, string> = {
  red: "bg-red-950 text-red-300",
  yellow: "bg-amber-950 text-amber-300",
  blue: "bg-sky-950 text-sky-300",
};

const COMPETITION_LABEL: Record<string, string> = {
  red: "🔴 Red · 포화",
  yellow: "🟡 Yellow · 각도",
  blue: "🔵 Blue · 미개척",
};

const SPRINT_STATUS_LABEL: Record<string, string> = {
  candidate: "◯ 후보",
  pursuing: "▶ 진행중",
  "kicked-off": "🚀 킥오프",
  dropped: "✗ 제외",
};

type WikiIdea = {
  slug: string;
  title: string;
  type: string;
  status: string;
  confidence: string;
  domain: string[];
  tags: string[];
  source_created: string | null;
  ingested_at: string | null;
  summary: string;
  obsidian_uri: string;
};

const WIKI_IDEA_TYPE_STYLE: Record<string, string> = {
  evergreen: "bg-emerald-950 text-emerald-300",
  "fact-table": "bg-emerald-950 text-emerald-300",
  "how-to": "bg-sky-950 text-sky-300",
  reference: "bg-sky-950 text-sky-300",
  inbox: "bg-[color:var(--muted)]/20 text-muted-foreground",
  journal: "bg-[color:var(--muted)]/20 text-muted-foreground",
};

const WIKI_IDEA_STATUS_LABEL: Record<string, string> = {
  open: "▶ 진행중",
  active: "▶ 진행중",
  draft: "◯ 초안",
  archived: "✗ 보관",
};

const WIKI_IDEA_CONF_STYLE: Record<string, string> = {
  high: "text-emerald-300",
  medium: "text-amber-300",
  low: "text-muted",
};

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function BusinessIdeasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const gradeFilter = firstValue(sp.grade); // A/B/all
  const compFilter = firstValue(sp.comp); // red/yellow/blue/all
  const statusFilter = firstValue(sp.status) ?? "open"; // open (미결정+candidate) / all / pursuing / kicked-off / dropped

  const supabase = await getServerAuthClient();

  const { data, error } = await supabase
    .from("applications")
    .select(
      `id, sprint_status, sprint_decided_at, competition_level, business_grade,
       insight_generated_at,
       projects(id, channel, title, category, contract_type, work_type,
                budget_min, budget_max, duration_days, external_url, first_seen_at)`,
    )
    .not("insight_report", "is", null)
    .not("business_grade", "is", null)
    .order("insight_generated_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-lg font-semibold text-red-300">DB 오류</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => r.projects !== null)
    .filter((r) => {
      if (gradeFilter && gradeFilter !== "all") {
        return r.business_grade === gradeFilter;
      }
      // 기본: A + B 만 (사업화 후보)
      return r.business_grade === "A" || r.business_grade === "B";
    })
    .filter((r) => {
      if (!compFilter || compFilter === "all") return true;
      return r.competition_level === compFilter;
    })
    .filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open")
        return r.sprint_status === null || r.sprint_status === "candidate";
      return r.sprint_status === statusFilter;
    });

  const totalA = rows.filter((r) => r.business_grade === "A").length;
  const totalB = rows.filter((r) => r.business_grade === "B").length;
  const totalPursuing = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.sprint_status === "pursuing" || r.sprint_status === "kicked-off",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          🎯 사업 아이템 후보
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          자동 분석 완료된 A·B 등급 프로젝트 큐레이션 · 표시 {rows.length}건 (A{" "}
          {totalA} · B {totalB}) · Sprint 진행중 {totalPursuing}건
        </p>
      </div>

      <FilterBar
        gradeFilter={gradeFilter}
        compFilter={compFilter}
        statusFilter={statusFilter}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-surface/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            조건에 맞는 사업 아이템이 없습니다.
          </p>
          <p className="mt-2 text-sm text-muted">
            자동 분석 배치가 매일 15:00 KST 실행됩니다. 개별 프로젝트에서 수동
            분석도 가능합니다.
          </p>
        </div>
      ) : null}

      {rows.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((r) => {
            const p = r.projects!;
            return (
              <li
                key={r.id}
                className="rounded-xl border border-[color:var(--border)] bg-surface/40 p-5 transition hover:border-[color:var(--accent)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {r.business_grade && (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${GRADE_STYLE[r.business_grade] ?? ""}`}
                    >
                      등급 {r.business_grade}
                    </span>
                  )}
                  {r.competition_level && (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${COMPETITION_STYLE[r.competition_level] ?? ""}`}
                    >
                      {COMPETITION_LABEL[r.competition_level] ?? r.competition_level}
                    </span>
                  )}
                  {r.sprint_status && (
                    <span className="rounded bg-[color:var(--muted)]/30 px-2 py-0.5 text-xs text-foreground/85">
                      {SPRINT_STATUS_LABEL[r.sprint_status] ?? r.sprint_status}
                    </span>
                  )}
                </div>
                <Link
                  href={`/radar/project/${p.id}`}
                  className="mt-3 block text-base font-medium text-foreground hover:text-white"
                >
                  {p.title}
                </Link>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                  {CHANNEL_LABEL[p.channel] ?? p.channel} ·{" "}
                  {p.category ?? "카테고리 -"} · 예산{" "}
                  {p.budget_min
                    ? `${(p.budget_min / 10000).toLocaleString()}만원`
                    : "미공개"}
                  {p.budget_max && p.budget_max !== p.budget_min
                    ? ` ~ ${(p.budget_max / 10000).toLocaleString()}만원`
                    : ""}{" "}
                  · {p.duration_days ?? "-"}일
                </p>
                <p className="mt-2 text-xs text-muted/70">
                  분석 완료 {formatDate(r.insight_generated_at)}
                  {r.sprint_decided_at
                    ? ` · Sprint 결정 ${formatDate(r.sprint_decided_at)}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <WikiIdeasSection ideas={wikiIdeasData.ideas as WikiIdea[]} />
    </div>
  );
}

function WikiIdeasSection({ ideas }: { ideas: WikiIdea[] }) {
  if (ideas.length === 0) return null;
  return (
    <section className="space-y-4 pt-6">
      <div className="border-t border-[color:var(--border)]/70 pt-6">
        <h2 className="text-lg font-semibold tracking-tight">
          🧠 Wiki Ideas · 자체 기획
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprint Radar 크롤 소스 외 · Obsidian vault 개인 아이디어 {ideas.length}
          건 (LLM 판정 없음 · 수동 검토)
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {ideas.map((idea) => (
          <li
            key={idea.slug}
            className="rounded-xl border border-[color:var(--border)] bg-surface/40 p-5 transition hover:border-[color:var(--accent)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${WIKI_IDEA_TYPE_STYLE[idea.type] ?? WIKI_IDEA_TYPE_STYLE.inbox}`}
              >
                {idea.type}
              </span>
              <span className="rounded bg-[color:var(--muted)]/30 px-2 py-0.5 text-xs text-foreground/85">
                {WIKI_IDEA_STATUS_LABEL[idea.status] ?? idea.status}
              </span>
              <span
                className={`text-xs ${WIKI_IDEA_CONF_STYLE[idea.confidence] ?? "text-muted"}`}
                title={`confidence: ${idea.confidence}`}
              >
                ● {idea.confidence}
              </span>
            </div>
            <a
              href={idea.obsidian_uri}
              className="mt-3 block text-base font-medium text-foreground hover:text-white"
            >
              {idea.title} ↗
            </a>
            {idea.summary && (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                {idea.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {idea.domain.slice(0, 4).map((d) => (
                <span
                  key={d}
                  className="rounded bg-[color:var(--muted)]/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted/70">
              vault 원본 · {idea.source_created ?? "날짜 미기록"} · Obsidian
              에서 열기
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterBar({
  gradeFilter,
  compFilter,
  statusFilter,
}: {
  gradeFilter: string | undefined;
  compFilter: string | undefined;
  statusFilter: string;
}) {
  return (
    <form
      action="/radar/business-ideas"
      method="get"
      className="grid gap-3 rounded-xl border border-[color:var(--border)]/70 bg-surface/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Select name="grade" label="사업화 등급" value={gradeFilter ?? ""}>
        <option value="">A + B (기본)</option>
        <option value="A">A 만</option>
        <option value="B">B 만</option>
        <option value="all">전체 (C, D 포함)</option>
      </Select>

      <Select name="comp" label="경쟁 강도" value={compFilter ?? ""}>
        <option value="">전체</option>
        <option value="blue">🔵 Blue · 미개척</option>
        <option value="yellow">🟡 Yellow · 각도</option>
        <option value="red">🔴 Red · 포화</option>
      </Select>

      <Select name="status" label="Sprint 상태" value={statusFilter}>
        <option value="open">◯ 미결정 + 후보</option>
        <option value="pursuing">▶ 진행중</option>
        <option value="kicked-off">🚀 킥오프</option>
        <option value="dropped">✗ 제외</option>
        <option value="all">전체</option>
      </Select>

      <div className="flex items-end">
        <button
          type="submit"
          className="w-full rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-foreground/90"
        >
          적용
        </button>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-[color:var(--border)]/70 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}
