// 크론 실행 이력 · ds_cron_runs 에 한 줄을 남긴다.
//
// Vercel Hobby 는 런타임 로그를 1시간만 보관한다. 22시(UTC) 에 실패하면
// 아침에는 읽을 것이 없다. 그래서 실행 결과를 우리 DB 에 남긴다.
//
// 성공한 실행도 남긴다. 실패만 남기면 "실패가 없다" 와 "아예 돌지 않았다" 를
// 구별할 수 없다. 기록이 매일 한 줄 늘어나는 것이 살아 있다는 증거이고,
// 빠진 날짜가 곧 경보다.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alert } from "./alerts";
import type { HeartbeatResult } from "./heartbeat";

export type RunStatus = "success" | "partial" | "failed";

export type RunRecord = {
  runDate: string;
  startedAt: string;
  endedAt: string;
  status: RunStatus;
  failedSteps: string[];
  steps: Record<string, unknown>;
  alerts: Alert[];
  alertMailSent: boolean;
  alertMailError: string | null;
  heartbeat: HeartbeatResult;
  summary: string;
};

/**
 * 절대 예외를 던지지 않는다. 기록이 실패했다고 발행이 실패한 것으로
 * 취급되면, 기록을 위해 본업을 잃는다. 실패는 반환값으로만 알린다.
 */
export async function saveRun(
  db: SupabaseClient,
  run: RunRecord,
): Promise<string | null> {
  const started = Date.parse(run.startedAt);
  const ended = Date.parse(run.endedAt);

  try {
    const { error } = await db.from("ds_cron_runs").insert({
      run_date: run.runDate,
      started_at: run.startedAt,
      ended_at: run.endedAt,
      duration_ms: Number.isFinite(started) && Number.isFinite(ended)
        ? ended - started
        : null,
      status: run.status,
      failed_steps: run.failedSteps,
      steps: run.steps,
      alert_count: run.alerts.length,
      alerts: run.alerts.length > 0 ? run.alerts : null,
      alert_mail_sent: run.alertMailSent,
      alert_mail_error: run.alertMailError,
      heartbeat: run.heartbeat,
      summary: run.summary.slice(0, 500),
    });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
