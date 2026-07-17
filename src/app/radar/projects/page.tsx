// /radar/projects · project list with filters, sort, pagination.

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import {
  CHANNEL_LABEL,
  CONTRACT_LABEL,
  formatKRW,
  formatDate,
  scoreTone,
} from "@/lib/radar-format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
  work_type: string | null;
  applicants_count: number | null;
  location: string | null;
  posted_at: string | null;
  first_seen_at: string;
  status: string;
  relevance_scores: { score: number }[] | null;
};

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

const SORT_OPTIONS = {
  score: { label: "정합도 높은순", column: "first_seen_at", ascending: false },
  recent: { label: "최근 수집순", column: "first_seen_at", ascending: false },
  budget: { label: "예산 높은순", column: "budget_min", ascending: false },
  budget_asc: { label: "예산 낮은순", column: "budget_min", ascending: true },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const channel = firstValue(sp.channel);
  const contract = firstValue(sp.contract);
  const minScore = Number(firstValue(sp.min) ?? "0");
  const status = firstValue(sp.status) ?? "active";
  const sortKey = (firstValue(sp.sort) ?? "score") as SortKey;
  const page = Math.max(1, Number(firstValue(sp.page) ?? "1"));
  const pageSize = 20;

  const supabase = await getServerAuthClient();

  let query = supabase
    .from("projects")
    .select(
      `id, channel, external_url, title, category, budget_min, budget_max,
       duration_days, contract_type, work_type, applicants_count, location,
       posted_at, first_seen_at, status,
       relevance_scores(score)`,
      { count: "exact" },
    )
    .eq("status", status);

  if (channel) query = query.eq("channel", channel);
  if (contract) query = query.eq("contract_type", contract);

  const sortConfig = SORT_OPTIONS[sortKey] ?? SORT_OPTIONS.score;
  query = query
    .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query.returns<ProjectRow[]>();

  const rows = (data ?? [])
    .map((p) => ({ ...p, relevance: p.relevance_scores?.[0]?.score ?? 0 }))
    .filter((p) => p.relevance >= minScore);

  // Client-side score sort (Supabase can't order by relevance without a view)
  if (sortKey === "score") {
    rows.sort((a, b) => b.relevance - a.relevance);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">프로젝트</h1>
        <p className="mt-1 text-sm text-neutral-400">
          전체 {count ?? 0}건 · 표시 {rows.length}건 · 페이지 {page}/{totalPages}
        </p>
      </div>

      <FilterBar
        channel={channel}
        contract={contract}
        minScore={minScore}
        status={status}
        sortKey={sortKey}
      />

      <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800 bg-neutral-900/30">
        {rows.length === 0 ? (
          <li className="p-8 text-center text-sm text-neutral-500">
            조건에 맞는 프로젝트가 없습니다.
          </li>
        ) : (
          rows.map((p) => (
            <li key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${scoreTone(p.relevance)}`}
                    >
                      ★ {p.relevance}/10
                    </span>
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
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                      {formatDate(p.first_seen_at)} 수집
                    </span>
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
                      : ""}{" "}
                    · 기간 {p.duration_days ?? "-"}일 · 지원자 {p.applicants_count ?? 0}명
                    · {p.location ?? "-"}
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
          ))
        )}
      </ul>

      {error && <p className="text-xs text-red-400">DB 오류: {error.message}</p>}

      <Pagination
        page={page}
        totalPages={totalPages}
        channel={channel}
        contract={contract}
        minScore={minScore}
        status={status}
        sortKey={sortKey}
      />
    </div>
  );
}

function FilterBar({
  channel,
  contract,
  minScore,
  status,
  sortKey,
}: {
  channel: string | undefined;
  contract: string | undefined;
  minScore: number;
  status: string;
  sortKey: SortKey;
}) {
  return (
    <form
      action="/radar/projects"
      method="get"
      className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <Select name="channel" label="채널" value={channel ?? ""}>
        <option value="">전체</option>
        {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>

      <Select name="contract" label="계약 형태" value={contract ?? ""}>
        <option value="">전체</option>
        {Object.entries(CONTRACT_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>

      <Select name="min" label="정합도 ≥" value={String(minScore)}>
        {[0, 3, 5, 6, 7, 8].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>

      <Select name="status" label="상태" value={status}>
        <option value="active">active</option>
        <option value="closed">closed</option>
        <option value="expired">expired</option>
      </Select>

      <Select name="sort" label="정렬" value={sortKey}>
        {Object.entries(SORT_OPTIONS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>

      <div className="col-span-full flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-900 hover:bg-white"
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
      <span className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}

function Pagination({
  page,
  totalPages,
  channel,
  contract,
  minScore,
  status,
  sortKey,
}: {
  page: number;
  totalPages: number;
  channel: string | undefined;
  contract: string | undefined;
  minScore: number;
  status: string;
  sortKey: SortKey;
}) {
  if (totalPages <= 1) return null;
  const base = new URLSearchParams();
  if (channel) base.set("channel", channel);
  if (contract) base.set("contract", contract);
  if (minScore > 0) base.set("min", String(minScore));
  if (status !== "active") base.set("status", status);
  if (sortKey !== "score") base.set("sort", sortKey);

  const prev = new URLSearchParams(base);
  prev.set("page", String(Math.max(1, page - 1)));
  const next = new URLSearchParams(base);
  next.set("page", String(Math.min(totalPages, page + 1)));

  return (
    <div className="flex items-center justify-between text-xs text-neutral-500">
      <Link
        href={`/radar/projects?${prev.toString()}`}
        className={`rounded-md border border-neutral-700 px-3 py-1.5 ${
          page <= 1
            ? "pointer-events-none opacity-40"
            : "hover:border-neutral-500 hover:text-neutral-200"
        }`}
      >
        ← 이전
      </Link>
      <span>
        {page} / {totalPages}
      </span>
      <Link
        href={`/radar/projects?${next.toString()}`}
        className={`rounded-md border border-neutral-700 px-3 py-1.5 ${
          page >= totalPages
            ? "pointer-events-none opacity-40"
            : "hover:border-neutral-500 hover:text-neutral-200"
        }`}
      >
        다음 →
      </Link>
    </div>
  );
}
