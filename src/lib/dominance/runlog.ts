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

// ── 35차 D · JSON 다시 부른 기록 ────────────────────────────────────────────
//
// callJson 이 JSON 이 깨진 응답을 받고 한 번 다시 부를 때마다 한 줄을 남긴다(모델 · 단계 · 앞 80자).
// ds_cron_runs 에 넣으면 /dominance/runs 에 가짜 크론 실행으로 보이므로 넣지 않는다.
// 표를 새로 만들지 않으려고(DDL 은 운영자 몫) 비공개 버킷 ds-drafts 의 날짜별 파일에 쌓는다.
//   ds-drafts/logs/json-retry/<KST 날짜>.json  →  [{ at, model, stage, head }]
// 이 기록도 예외를 던지지 않는다. 기록 때문에 본 호출을 잃지 않는다.

export type JsonRetryLine = { at: string; model: string; stage: string; head: string };

export const JSON_RETRY_DIR = "logs/json-retry";

export function kstDay(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export async function logJsonRetry(line: Omit<JsonRetryLine, "at">): Promise<string | null> {
  try {
    const { getDominanceClient } = await import("./db");
    const db = getDominanceClient();
    const path = `${JSON_RETRY_DIR}/${kstDay()}.json`;
    const { data } = await db.storage.from("ds-drafts").download(path);
    const lines: JsonRetryLine[] = data ? (JSON.parse(await data.text()) as JsonRetryLine[]) : [];
    lines.push({ at: new Date().toISOString(), ...line, head: line.head.slice(0, 80) });
    const { error } = await db.storage
      .from("ds-drafts")
      .upload(path, new Blob([JSON.stringify(lines, null, 1)], { type: "application/json" }), { upsert: true });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** 그날(KST)의 JSON 다시 부른 기록 */
export async function readJsonRetries(db: SupabaseClient, day: string): Promise<JsonRetryLine[]> {
  const { data } = await db.storage.from("ds-drafts").download(`${JSON_RETRY_DIR}/${day}.json`);
  if (!data) return [];
  try {
    return JSON.parse(await data.text()) as JsonRetryLine[];
  } catch {
    return [];
  }
}
