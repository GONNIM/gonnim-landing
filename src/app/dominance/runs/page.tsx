// 크론 기록 · 매일 자동으로 도는 작업이 실제로 돌았는지 사람이 눈으로 확인하는 곳.
//
// Vercel Hobby 는 크론 실패를 알려주지 않고 런타임 로그를 1시간만 보관한다.
// 이 화면은 ds_cron_runs 를 읽으므로 며칠 전 실패도 그대로 남아 있다.
//
// 가장 중요한 것은 목록이 아니라 맨 위의 두 줄이다. "마지막 실행이 언제였나" 와
// "빠진 날짜가 있나". 원본 앱은 실패한 것이 아니라 아무도 이것을 안 봐서 죽었다.

import { dominanceContext } from "@/lib/dominance/guard";
import { formatKstDateTime, kstDateAfter } from "@/lib/dominance/kst";
import { isMissingSchema, SchemaNotice } from "@/lib/dominance/schema-guard";

export const dynamic = "force-dynamic";

// Hobby 크론은 지정 시각에서 ±59분 흔들리고 전달 자체가 최선 노력이다.
// 그래서 24시간이 아니라 26시간을 넘겨야 이상으로 본다.
const STALE_HOURS = 26;
const LOOKBACK_DAYS = 14;

type Run = {
  id: string;
  run_date: string;
  started_at: string;
  duration_ms: number | null;
  status: "success" | "partial" | "failed";
  failed_steps: string[] | null;
  steps: unknown;
  alert_count: number;
  alerts: unknown;
  alert_mail_sent: boolean;
  alert_mail_error: string | null;
  heartbeat: string;
  summary: string | null;
};

const STATUS_STYLE: Record<Run["status"], string> = {
  success: "bg-emerald-500/15 text-emerald-300",
  partial: "bg-amber-500/15 text-amber-200",
  failed: "bg-red-500/15 text-red-300",
};

const STATUS_LABEL: Record<Run["status"], string> = {
  success: "정상",
  partial: "일부 실패",
  failed: "실패",
};

const HEARTBEAT_LABEL: Record<string, string> = {
  ok: "정상 신호 보냄",
  fail: "실패 신호 보냄",
  skipped: "감시 주소 없음",
  error: "신호 보내기 실패",
};

export default async function DominanceRuns() {
  const { db } = await dominanceContext();

  const { data, error } = await db
    .from("ds_cron_runs")
    .select(
      "id, run_date, started_at, duration_ms, status, failed_steps, steps, alert_count, alerts, alert_mail_sent, alert_mail_error, heartbeat, summary",
    )
    .order("started_at", { ascending: false })
    .limit(60);

  if (isMissingSchema(error)) {
    return (
      <div className="space-y-6">
        <Heading />
        <SchemaNotice
          file="db/2026-09-25-dominance-cron-runs.sql"
          hint="실행하면 다음 크론부터 이 화면에 기록이 쌓입니다."
        />
      </div>
    );
  }

  const runs = (data ?? []) as Run[];
  const last = runs[0];

  const hoursSince = last
    ? (Date.now() - Date.parse(last.started_at)) / 3_600_000
    : null;
  const stale = hoursSince === null || hoursSince > STALE_HOURS;

  const ran = new Set(runs.map((r) => r.run_date));
  const missing: string[] = [];
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const d = kstDateAfter(-i);
    if (!ran.has(d)) missing.push(d);
  }

  return (
    <div className="space-y-6">
      <Heading />

      <section
        className={`rounded-xl border p-5 ${
          stale
            ? "border-red-500/40 bg-red-950/20"
            : "border-emerald-500/30 bg-emerald-950/10"
        }`}
      >
        {last ? (
          <>
            <p
              className={`text-sm font-medium ${stale ? "text-red-200" : "text-emerald-200"}`}
            >
              {stale
                ? `마지막 실행이 ${Math.floor(hoursSince!)}시간 전입니다. ${STALE_HOURS}시간을 넘겼습니다.`
                : `마지막 실행 ${formatKstDateTime(last.started_at)} · ${Math.floor(hoursSince!)}시간 전입니다.`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{last.summary}</p>
          </>
        ) : (
          <p className="text-sm font-medium text-red-200">
            기록이 한 건도 없습니다. 크론이 아직 한 번도 돌지 않았습니다.
          </p>
        )}
      </section>

      {missing.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-5">
          <p className="text-sm font-medium text-amber-200">
            최근 {LOOKBACK_DAYS}일 중 기록이 없는 날이 {missing.length}일 있습니다.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {missing.join(" · ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            기록을 남기는 기능을 넣은 날보다 앞선 날짜는 여기 그대로 보입니다. 그 날짜는
            무시하십시오.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">실행 기록</h2>
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
            아직 기록이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]/60 rounded-xl border border-[color:var(--border)]/70 bg-surface/30">
            {runs.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-sm text-foreground">
                    {formatKstDateTime(r.started_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.duration_ms !== null
                      ? `${(r.duration_ms / 1000).toFixed(1)}초`
                      : "끝나지 않음"}
                  </span>
                  {r.alert_count > 0 && (
                    <span className="text-xs text-amber-300">
                      경보 {r.alert_count}건
                      {r.alert_mail_sent ? " · 메일 보냄" : " · 메일 못 보냄"}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    감시 신호 {HEARTBEAT_LABEL[r.heartbeat] ?? r.heartbeat}
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>

                {r.alert_mail_error && (
                  <p className="mt-1 text-xs text-red-300">
                    경보 메일 실패: {r.alert_mail_error}
                  </p>
                )}

                {(r.failed_steps?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-red-300">
                    실패한 단계: {r.failed_steps!.join(", ")}
                  </p>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    단계별 원본 보기
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-[color:var(--border)]/50 bg-background/60 p-3 text-[11px] leading-relaxed text-foreground/80">
                    {JSON.stringify({ steps: r.steps, alerts: r.alerts }, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Heading() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">크론 기록</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        매일 한 번 도는 자동 작업의 결과입니다. 성공한 실행도 남깁니다. 실패만 남기면
        실패가 없는 것과 아예 돌지 않은 것을 구별할 수 없습니다.
      </p>
    </section>
  );
}
