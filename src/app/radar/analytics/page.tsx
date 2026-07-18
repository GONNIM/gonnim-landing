// /radar/analytics · Sprint funnel + channel breakdown + revenue tree
// + recent activity timeline. Server component.

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_ORDER,
  CHANNEL_LABEL,
  scoreTone,
  formatDate,
  formatKRW,
} from "@/lib/radar-format";

export const dynamic = "force-dynamic";

// Sprint W1: 2026-07-07 kickoff → Q1 = 2026-10-06
const SPRINT_KICKOFF = new Date("2026-07-07T00:00:00Z");
const Q1_TARGET_WON = 15_000_000; // ₩15M
const Q1_DEADLINE = new Date("2026-10-06T23:59:59Z");

type ProjectRow = {
  id: string;
  channel: string;
  contract_type: string | null;
  first_seen_at: string;
  status: string;
  relevance_scores: { score: number }[] | null;
};

type AppRow = {
  id: string;
  status: string;
  project_id: string;
  contract_amount: number | null;
  applied_at: string | null;
  response_received_at: string | null;
  meeting_scheduled_at: string | null;
  contracted_at: string | null;
  updated_at: string;
  projects: { title: string; channel: string } | { title: string; channel: string }[] | null;
};

export default async function AnalyticsPage() {
  const supabase = await getServerAuthClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, channel, contract_type, first_seen_at, status, relevance_scores(score)")
    .returns<ProjectRow[]>();

  const { data: apps } = await supabase
    .from("applications")
    .select(
      `id, status, project_id, contract_amount, applied_at, response_received_at,
       meeting_scheduled_at, contracted_at, updated_at,
       projects(title, channel)`,
    )
    .returns<AppRow[]>();

  const projectRows = projects ?? [];
  const appRows = apps ?? [];

  // -------- Funnel counts --------
  const funnel: Record<string, number> = {};
  for (const s of APPLICATION_STATUS_ORDER) funnel[s] = 0;
  for (const a of appRows) {
    if (a.status in funnel) funnel[a.status] += 1;
  }

  // Conversion rates (applied → responded → meeting → contracted)
  const applied = funnel.applied + funnel.responded + funnel.meeting + funnel.contracted;
  const responded = funnel.responded + funnel.meeting + funnel.contracted;
  const meeting = funnel.meeting + funnel.contracted;
  const contracted = funnel.contracted;

  const responseRate = applied > 0 ? Math.round((responded / applied) * 100) : 0;
  const meetingRate = responded > 0 ? Math.round((meeting / responded) * 100) : 0;
  const closeRate = meeting > 0 ? Math.round((contracted / meeting) * 100) : 0;

  // -------- Channel breakdown --------
  type ChannelStat = {
    total: number;
    outsourcing: number;
    contractor: number;
    avgScore: number;
    highScore: number; // ≥7
    applied: number;
    contracted: number;
  };
  const byChannel: Record<string, ChannelStat> = {};
  for (const p of projectRows) {
    const c = p.channel;
    if (!byChannel[c])
      byChannel[c] = {
        total: 0,
        outsourcing: 0,
        contractor: 0,
        avgScore: 0,
        highScore: 0,
        applied: 0,
        contracted: 0,
      };
    byChannel[c].total += 1;
    if (p.contract_type === "outsourcing") byChannel[c].outsourcing += 1;
    if (p.contract_type === "contractor") byChannel[c].contractor += 1;
    const s = p.relevance_scores?.[0]?.score ?? 0;
    byChannel[c].avgScore += s;
    if (s >= 7) byChannel[c].highScore += 1;
  }
  for (const c in byChannel) {
    byChannel[c].avgScore =
      byChannel[c].total > 0
        ? Math.round((byChannel[c].avgScore / byChannel[c].total) * 10) / 10
        : 0;
  }
  // Enrich with application counts
  for (const a of appRows) {
    const proj = projectRows.find((p) => p.id === a.project_id);
    if (!proj || !byChannel[proj.channel]) continue;
    if (a.status !== "interested" && a.status !== "drafting")
      byChannel[proj.channel].applied += 1;
    if (a.status === "contracted") byChannel[proj.channel].contracted += 1;
  }

  // -------- Revenue tree --------
  const contractedRevenue = appRows
    .filter((a) => a.status === "contracted" && a.contract_amount)
    .reduce((sum, a) => sum + (a.contract_amount ?? 0), 0);

  const q1Progress = Math.min(100, Math.round((contractedRevenue / Q1_TARGET_WON) * 100));
  const daysToDeadline = Math.max(
    0,
    Math.ceil((Q1_DEADLINE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  const sprintDays = Math.max(
    1,
    Math.ceil((Date.now() - SPRINT_KICKOFF.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // -------- Recent activity timeline (top 12) --------
  const activity = appRows
    .flatMap<{ at: string; label: string; app: AppRow }>((a) => {
      const events: { at: string; label: string; app: AppRow }[] = [];
      if (a.applied_at)
        events.push({ at: a.applied_at, label: "지원 완료", app: a });
      if (a.response_received_at)
        events.push({ at: a.response_received_at, label: "응답 받음", app: a });
      if (a.meeting_scheduled_at)
        events.push({ at: a.meeting_scheduled_at, label: "미팅 예정", app: a });
      if (a.contracted_at)
        events.push({ at: a.contracted_at, label: "계약", app: a });
      return events;
    })
    .sort((a, b) => (b.at < a.at ? -1 : 1))
    .slice(0, 12);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">분석</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Sprint W{Math.ceil(sprintDays / 7)} · Day {sprintDays} · Q1 마감까지{" "}
          {daysToDeadline}일 남음
        </p>
      </div>

      {/* Revenue tree */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-neutral-300">
            Q1 매출 트리 (2026-10-06 마감)
          </h2>
          <span className="text-xs text-neutral-500">
            목표 {formatKRW(Q1_TARGET_WON)}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-neutral-100">
            {formatKRW(contractedRevenue)}
          </span>
          <span className="text-sm text-neutral-500">
            누적 계약 · {q1Progress}% · 남은 목표 {formatKRW(Math.max(0, Q1_TARGET_WON - contractedRevenue))}
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-neutral-800">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${q1Progress}%` }}
          />
        </div>
      </section>

      {/* Funnel */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">지원 Funnel</h2>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {APPLICATION_STATUS_ORDER.map((s) => (
            <div
              key={s}
              className="rounded-lg border border-neutral-800/70 bg-neutral-950 p-3"
            >
              <p className="text-xs text-neutral-500">{APPLICATION_STATUS[s]}</p>
              <p className="mt-1 text-lg font-semibold text-neutral-100">
                {funnel[s]}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <RateCard label="응답률" value={responseRate} note={`${responded}/${applied}`} />
          <RateCard label="미팅 성사율" value={meetingRate} note={`${meeting}/${responded}`} />
          <RateCard label="계약 성사율" value={closeRate} note={`${contracted}/${meeting}`} />
        </div>
      </section>

      {/* Channel breakdown */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">채널별 통계</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-800 text-sm">
            <thead className="bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left">채널</th>
                <th className="px-4 py-3 text-right">총 프로젝트</th>
                <th className="px-4 py-3 text-right">외주</th>
                <th className="px-4 py-3 text-right">기간제</th>
                <th className="px-4 py-3 text-right">평균 정합도</th>
                <th className="px-4 py-3 text-right">Top(≥7)</th>
                <th className="px-4 py-3 text-right">지원</th>
                <th className="px-4 py-3 text-right">계약</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {Object.entries(byChannel).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
                    아직 수집된 프로젝트가 없습니다.
                  </td>
                </tr>
              ) : (
                Object.entries(byChannel).map(([channel, stat]) => (
                  <tr key={channel} className="text-neutral-200">
                    <td className="px-4 py-3">
                      {CHANNEL_LABEL[channel] ?? channel}
                    </td>
                    <td className="px-4 py-3 text-right">{stat.total}</td>
                    <td className="px-4 py-3 text-right text-emerald-300">
                      {stat.outsourcing}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500">
                      {stat.contractor}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${scoreTone(Math.round(stat.avgScore))}`}
                      >
                        {stat.avgScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{stat.highScore}</td>
                    <td className="px-4 py-3 text-right">{stat.applied}</td>
                    <td className="px-4 py-3 text-right">{stat.contracted}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Activity timeline */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">최근 활동 (12건)</h2>
        {activity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            지원 활동 이력이 아직 없습니다. 프로젝트 상세에서 Funnel 상태를 조작하면 여기에 기록됩니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {activity.map((e, i) => {
              const proj = Array.isArray(e.app.projects)
                ? e.app.projects[0]
                : e.app.projects;
              return (
                <li
                  key={`${e.app.id}-${e.label}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-neutral-800/70 bg-neutral-950/70 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                        {e.label}
                      </span>
                      <span className="text-neutral-500">
                        {CHANNEL_LABEL[proj?.channel ?? ""] ?? proj?.channel ?? "-"}
                      </span>
                      <span className="text-neutral-600">·</span>
                      <span className="text-neutral-500">{formatDate(e.at)}</span>
                    </div>
                    <Link
                      href={`/radar/project/${e.app.project_id}`}
                      className="mt-1 block truncate text-sm text-neutral-100 hover:text-white"
                    >
                      {proj?.title ?? "프로젝트"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function RateCard({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-100">{value}%</p>
      <p className="mt-1 text-xs text-neutral-500">{note}</p>
    </div>
  );
}
