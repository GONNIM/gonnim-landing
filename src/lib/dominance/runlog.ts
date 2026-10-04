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

// ── 날짜별 기록 파일(35차 D · 36차 B) ─────────────────────────────────────────
//
// ds_cron_runs 에 넣으면 /dominance/runs 에 가짜 크론 실행으로 보이므로 넣지 않는다.
// 표를 새로 만들지 않으려고(DDL 은 운영자 몫) 비공개 버킷 ds-drafts 의 날짜별 파일에 쌓는다.
//   ds-drafts/logs/json-retry/<KST 날짜>.json  →  [{ at, model, stage, head }]       (JSON 다시 부른 기록)
//   ds-drafts/logs/llm-calls/<KST 날짜>.json   →  [{ at, stage, model, input, … }]   (LLM 호출마다 · 36차)
// 파일은 읽고-더하고-쓰기다. 같은 프로세스 안에서 동시에 쓰면(교차 리뷰 두 모델 등) 한 줄을 잃으므로
// 파일마다 줄을 세워 하나씩 쓴다. 서로 다른 서버 인스턴스가 같은 순간에 쓰면 한 줄을 잃을 수 있다.
// 기록은 예외를 던지지 않는다. 기록 때문에 본 호출을 잃지 않는다.

export type JsonRetryLine = { at: string; model: string; stage: string; head: string };
export type LlmCallLine = {
  at: string;
  stage: string;
  model: string;
  input: number;
  output: number;
  reasoning: number;
  ms: number;
  cost: number | null;
  /** 48차 · 공급자(zai · groq · anthropic). 옛 줄에는 없다(= zai) */
  provider?: string;
};

export const JSON_RETRY_DIR = "logs/json-retry";
export const LLM_CALLS_DIR = "logs/llm-calls";

export function kstDay(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

const queues = new Map<string, Promise<unknown>>();

async function appendDayLog<T>(dir: string, line: T): Promise<string | null> {
  const path = `${dir}/${kstDay()}.json`;
  const run = async (): Promise<string | null> => {
    try {
      const { getDominanceClient } = await import("./db");
      const db = getDominanceClient();
      const { data } = await db.storage.from("ds-drafts").download(path);
      const lines: T[] = data ? (JSON.parse(await data.text()) as T[]) : [];
      lines.push(line);
      const { error } = await db.storage
        .from("ds-drafts")
        .upload(path, new Blob([JSON.stringify(lines, null, 1)], { type: "application/json" }), { upsert: true });
      return error ? error.message : null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  const next = (queues.get(path) ?? Promise.resolve()).then(run, run);
  queues.set(path, next);
  return next;
}

async function readDayLog<T>(db: SupabaseClient, dir: string, day: string): Promise<T[]> {
  const { data } = await db.storage.from("ds-drafts").download(`${dir}/${day}.json`);
  if (!data) return [];
  try {
    return JSON.parse(await data.text()) as T[];
  } catch {
    return [];
  }
}

export function logJsonRetry(line: Omit<JsonRetryLine, "at">): Promise<string | null> {
  return appendDayLog<JsonRetryLine>(JSON_RETRY_DIR, { at: new Date().toISOString(), ...line, head: line.head.slice(0, 80) });
}

/** 36차 B · LLM 호출 한 번 */
export function logLlmCall(line: Omit<LlmCallLine, "at">): Promise<string | null> {
  return appendDayLog<LlmCallLine>(LLM_CALLS_DIR, { at: new Date().toISOString(), ...line });
}

/** 그날(KST)의 JSON 다시 부른 기록 */
export function readJsonRetries(db: SupabaseClient, day: string): Promise<JsonRetryLine[]> {
  return readDayLog<JsonRetryLine>(db, JSON_RETRY_DIR, day);
}

/** 그날(KST)의 LLM 호출 기록 */
export function readLlmCalls(db: SupabaseClient, day: string): Promise<LlmCallLine[]> {
  return readDayLog<LlmCallLine>(db, LLM_CALLS_DIR, day);
}
