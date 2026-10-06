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
// 57차 C · 줄마다 파일 하나로 쓴다: ds-drafts/<dir>/<KST 날짜>/<시각>-<무작위>.json (한 줄 객체).
//   전에는 날짜 파일 하나를 읽고-더하고-쓰기 했다. 10/6 에 같은 프로세스 안에서도 한 줄을 잃었다(저장소가 방금 쓴 파일 대신
//   옛 파일을 돌려준 것으로 본다). 새 방식은 덮어쓰기가 없어 동시에 써도 줄을 잃지 않는다.
//   읽을 때는 옛 날짜 파일(<날짜>.json · 56차까지)과 새 폴더의 파일을 합쳐 시각 순으로 돌려준다.
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
  /** 48차 · 공급자(zai · groq · openai). 옛 줄에는 없다(= zai) */
  provider?: string;
  /** 57차 · 잃은 줄을 다른 기록(meta.json 등)으로 보충했으면 그 설명 */
  backfill?: string;
};

export const JSON_RETRY_DIR = "logs/json-retry";
export const LLM_CALLS_DIR = "logs/llm-calls";

export function kstDay(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export async function appendDayLog<T extends { at: string }>(dir: string, line: T): Promise<string | null> {
  const stamp = line.at.replace(/[:.]/g, "-");
  const path = `${dir}/${kstDay(new Date(line.at))}/${stamp}-${Math.random().toString(36).slice(2, 10)}.json`;
  try {
    const { getDominanceClient } = await import("./db");
    const db = getDominanceClient();
    const { error } = await db.storage
      .from("ds-drafts")
      .upload(path, new Blob([JSON.stringify(line)], { type: "application/json" }), { upsert: false });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function readDayLog<T extends { at: string }>(db: SupabaseClient, dir: string, day: string): Promise<T[]> {
  const out: T[] = [];
  // 옛 날짜 파일(56차까지)
  const { data: legacy } = await db.storage.from("ds-drafts").download(`${dir}/${day}.json`);
  if (legacy) {
    try {
      out.push(...(JSON.parse(await legacy.text()) as T[]));
    } catch {
      // 깨진 옛 파일은 건너뛴다
    }
  }
  // 57차 · 줄마다 파일
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.storage.from("ds-drafts").list(`${dir}/${day}`, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    const page = (data ?? []).filter((f) => f.name.endsWith(".json")).map((f) => f.name);
    names.push(...page);
    if (!data || data.length < 1000) break;
  }
  for (let i = 0; i < names.length; i += 16) {
    const lines = await Promise.all(
      names.slice(i, i + 16).map(async (n) => {
        const { data } = await db.storage.from("ds-drafts").download(`${dir}/${day}/${n}`);
        if (!data) return null;
        try {
          return JSON.parse(await data.text()) as T;
        } catch {
          return null;
        }
      }),
    );
    out.push(...lines.filter((x): x is Awaited<T> => x !== null) as T[]);
  }
  return out.sort((x, y) => x.at.localeCompare(y.at));
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
