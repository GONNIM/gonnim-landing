// 지배상식 크론 하나 · 하루 1회. vercel.json 의 "0 22 * * *" UTC = 07시 KST.
//
// 다섯 단계를 순서대로 돈다. 쪼개지 않는 이유는 Hobby 도 300초를 쓰고,
// arXiv 의 3초 대기와 LLM 호출이 과금 CPU 시간에 들어가지 않기 때문이다.
//
// 앞 단계가 실패해도 뒤 단계를 멈추지 않는다. 수집이 실패했다고 오늘 발행이
// 막히면 안 된다 — 발행할 글은 이미 며칠 전에 승인이 끝나 있다.
// 대신 실패는 전부 모아 5단계 경보 메일로 나간다.
//
// 끝나면 결과를 ds_cron_runs 에 남기고 하트비트를 찌른다. Vercel Hobby 는 크론
// 실패를 알려주지 않고 로그를 1시간만 보관하므로, 이 경로가 스스로 흔적을
// 남기지 않으면 아침에 확인할 것이 없다.

import type { NextRequest } from "next/server";

import { gatherAlerts, sendAlertEmail, type Alert } from "@/lib/dominance/alerts";
import { fetchBroadcastState } from "@/lib/dominance/broadcast";
import { buildCandidates } from "@/lib/dominance/candidates";
import { getDominanceClient } from "@/lib/dominance/db";
import { pingHeartbeat } from "@/lib/dominance/heartbeat";
import { kstDateAfter, kstToday } from "@/lib/dominance/kst";
import { publishDue } from "@/lib/dominance/publish";
import { saveRun, type RunStatus } from "@/lib/dominance/runlog";
import { collectAll } from "@/lib/dominance/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function fail(step: string, err: unknown): Alert {
  return {
    code: "step",
    title: `${step} 단계가 실패했습니다`,
    detail: err instanceof Error ? err.message : String(err),
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDominanceClient();
  const today = kstToday();
  const startedAt = new Date().toISOString();
  const extraAlerts: Alert[] = [];
  const steps: Record<string, unknown> = {};
  const failedSteps: string[] = [];

  // 1. 수집
  let reports: { source: string; found: number; errors: string[] }[] = [];
  let newRows = 0;
  try {
    const collected = await collectAll(db);
    reports = collected.reports;
    newRows = collected.insertedPapers + collected.insertedPress;
    steps.collect = {
      papers: collected.insertedPapers,
      press: collected.insertedPress,
      reports: collected.reports,
    };
  } catch (err) {
    failedSteps.push("수집");
    extraAlerts.push(fail("수집", err));
    steps.collect = { error: String(err) };
  }

  // 2. 후보 생성
  let inserted = 0;
  try {
    const built = await buildCandidates(db, { date: today });
    inserted = built.inserted;
    steps.candidates = {
      inserted: built.inserted,
      trustRejected: built.trustRejected,
      errors: built.errors,
    };
    for (const e of built.errors) {
      extraAlerts.push({ code: "step", title: "후보 생성 경고", detail: e });
    }
  } catch (err) {
    failedSteps.push("후보 생성");
    extraAlerts.push(fail("후보 생성", err));
    steps.candidates = { error: String(err) };
  }

  // 3. 발행 · 오늘 날짜가 붙은 승인된 글만
  let publishedCount = 0;
  try {
    const published = await publishDue(db, today);
    publishedCount = published.published;
    steps.publish = published;

    for (const o of published.outcomes) {
      if (!o.ok) {
        extraAlerts.push({
          code: "step",
          title: `발행 실패 · 「${o.title}」`,
          detail: `${o.error ?? "사유 불명"} · 상태는 approved 로 남았습니다. 고친 뒤 내일 다시 나갑니다.`,
        });
      }
    }
    // 글 하나라도 못 나갔으면 실패한 단계로 센다. 예외가 안 났다고 정상은 아니다.
    if (published.outcomes.some((o) => !o.ok)) failedSteps.push("발행");

    for (const e of published.errors) {
      extraAlerts.push({ code: "step", title: "발행 경고", detail: e });
    }
  } catch (err) {
    failedSteps.push("발행");
    extraAlerts.push(fail("발행", err));
    steps.publish = { error: String(err) };
  }

  // 4. 성과 확인 · 어제 발행분이 실제로 나갔는지.
  //    열람률은 Resend API 에 없으므로 읽지 않는다 (broadcast.ts 주석 참고).
  try {
    steps.stats = await syncYesterdayState(db);
  } catch (err) {
    failedSteps.push("성과 확인");
    extraAlerts.push(fail("성과 확인", err));
    steps.stats = { error: String(err) };
  }

  // 5. 경보
  const alerts = [...extraAlerts, ...(await gatherAlerts(db, reports))];
  const mail = await sendAlertEmail(alerts);

  // 6. 기록과 하트비트.
  //    원천에서 한 건도 못 받은 것은 예외가 없어도 고장이다 — 주소 규칙이 바뀌면
  //    수집기는 조용히 0건을 돌려준다. 그것이 원본 앱을 죽인 모습이다.
  const found = reports.reduce((sum, r) => sum + r.found, 0);
  const sourcesDead = reports.length > 0 && found === 0;
  const healthy = failedSteps.length === 0 && !sourcesDead;

  const status: RunStatus =
    failedSteps.length === 0 ? "success" : failedSteps.length >= 4 ? "failed" : "partial";

  const summary =
    `수집 ${found}건(신규 ${newRows}) · 후보 ${inserted}건 · 발행 ${publishedCount}편 · 경보 ${alerts.length}건` +
    (failedSteps.length > 0 ? ` · 실패 ${failedSteps.join(", ")}` : "") +
    (sourcesDead ? " · 원천 전부 0건" : "");

  const heartbeat = await pingHeartbeat(healthy, summary);
  const endedAt = new Date().toISOString();

  const logError = await saveRun(db, {
    runDate: today,
    startedAt,
    endedAt,
    status,
    failedSteps,
    steps,
    alerts,
    alertMailSent: mail.sent,
    alertMailError: mail.error,
    heartbeat,
    summary,
  });

  return Response.json({
    date: today,
    status,
    steps,
    alerts: alerts.length,
    alertMailSent: mail.sent,
    alertMailError: mail.error,
    heartbeat,
    logError,
  });
}

async function syncYesterdayState(
  db: ReturnType<typeof getDominanceClient>,
): Promise<unknown> {
  const yesterday = kstDateAfter(-1);

  const { data, error } = await db
    .from("ds_letters")
    .select("id, resend_broadcast_id")
    .eq("scheduled_for", yesterday)
    .eq("status", "published")
    .not("resend_broadcast_id", "is", null);

  if (error) throw new Error(`어제 발행분 읽기 실패: ${error.message}`);
  if ((data ?? []).length === 0) return { checked: 0 };

  const checked: { id: string; status: string; sentAt: string | null }[] = [];

  for (const row of data!) {
    const state = await fetchBroadcastState(row.resend_broadcast_id as string);
    await db
      .from("ds_letters")
      .update({
        sent_at: state.sentAt,
        stats_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    checked.push({ id: row.id as string, status: state.status, sentAt: state.sentAt });
  }

  return { checked: checked.length, detail: checked };
}
