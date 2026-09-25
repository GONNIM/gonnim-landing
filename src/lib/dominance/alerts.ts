// 경보 · 원본 앱이 죽은 이유가 16개월 무경보였다. 그래서 이 단계를 뺄 수 없다.
//
// 네 가지를 본다. 수집 실패 · 리뷰 장기 방치 · 앞으로 발행할 글이 없음 · 원천 링크 사망.
// 보낼 것이 없으면 메일을 보내지 않는다 — 매일 오는 "정상" 메일은 곧 안 읽게 되고,
// 그러면 진짜 경보도 같이 묻힌다.

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fromAddress } from "./broadcast";
import { kstDateAfter, kstToday } from "./kst";
import { isLinkAlive } from "./review";

/** 리뷰 대기로 이 일수를 넘기면 알린다. */
const STALE_REVIEW_DAYS = 3;
/** 앞으로 이 일수 안에 승인된 글이 없으면 알린다. */
const EMPTY_PIPELINE_DAYS = 7;
/** 링크를 확인하는 최근 발행분 수. 전부 확인하면 크론 시간을 다 쓴다. */
const LINK_CHECK_LETTERS = 3;

export type Alert = {
  /** step 은 크론 단계 자체가 터진 경우다. 나머지는 운용 상태를 알리는 것이다. */
  code: "step" | "collect" | "stale_review" | "empty_pipeline" | "dead_link";
  title: string;
  detail: string;
};

type SourceReport = { source: string; found: number; errors: string[] };

/** ① 수집 실패 · 오류가 있거나 한 건도 못 받은 원천. */
function sourceAlerts(reports: SourceReport[]): Alert[] {
  const alerts: Alert[] = [];

  for (const r of reports) {
    if (r.errors.length > 0) {
      alerts.push({
        code: "collect",
        title: `${r.source} 수집 오류`,
        detail: r.errors.join(" / "),
      });
    } else if (r.found === 0) {
      alerts.push({
        code: "collect",
        title: `${r.source} 에서 한 건도 받지 못했습니다`,
        detail: "주소 규칙이 바뀌었는지 확인이 필요합니다.",
      });
    }
  }

  return alerts;
}

/** ② 리뷰 대기로 오래 멈춰 있는 글. */
async function staleReviewAlerts(db: SupabaseClient): Promise<Alert[]> {
  const cutoff = new Date(
    Date.now() - STALE_REVIEW_DAYS * 86_400_000,
  ).toISOString();

  const { data, error } = await db
    .from("ds_letters")
    .select("title, updated_at")
    .eq("status", "review")
    .lt("updated_at", cutoff);

  if (error) {
    return [
      { code: "stale_review", title: "리뷰 현황을 읽지 못했습니다", detail: error.message },
    ];
  }
  if ((data ?? []).length === 0) return [];

  return [
    {
      code: "stale_review",
      title: `리뷰 대기 ${data!.length}편이 ${STALE_REVIEW_DAYS}일을 넘겼습니다`,
      detail: data!.map((r) => `· ${r.title}`).join("\n"),
    },
  ];
}

/** ③ 앞으로 발행할 글이 없음. 재고가 있으면 그 수를 함께 알린다. */
async function emptyPipelineAlerts(db: SupabaseClient): Promise<Alert[]> {
  const today = kstToday();
  const until = kstDateAfter(EMPTY_PIPELINE_DAYS);

  const [approved, pool] = await Promise.all([
    db
      .from("ds_letters")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("scheduled_for", today)
      .lte("scheduled_for", until),
    db
      .from("ds_letters")
      .select("id", { count: "exact", head: true })
      .eq("status", "reviewed"),
  ]);

  if ((approved.count ?? 0) > 0) return [];

  const waiting = pool.count ?? 0;
  return [
    {
      code: "empty_pipeline",
      title: `앞으로 ${EMPTY_PIPELINE_DAYS}일 안에 발행 예정인 글이 없습니다`,
      detail:
        waiting > 0
          ? `리뷰를 통과한 글 ${waiting}편이 날짜를 기다립니다. 발행 달력에서 날짜를 붙이십시오.`
          : "리뷰를 통과한 글도 없습니다. 이슈 목록에서 글을 시작하십시오.",
    },
  ];
}

/** ④ 최근 발행분의 원천 링크가 살아 있는지. 죽은 링크는 정정 사유가 된다. */
async function deadLinkAlerts(db: SupabaseClient): Promise<Alert[]> {
  const { data, error } = await db
    .from("ds_letters")
    .select("title, ds_letter_sources(paper:ds_papers(landing_url), gov_press:ds_gov_press(landing_url))")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(LINK_CHECK_LETTERS);

  if (error) {
    return [
      { code: "dead_link", title: "발행분 원천을 읽지 못했습니다", detail: error.message },
    ];
  }

  type Joined = {
    title: string;
    ds_letter_sources: {
      paper: { landing_url: string } | null;
      gov_press: { landing_url: string } | null;
    }[];
  };

  const alerts: Alert[] = [];

  for (const letter of (data ?? []) as unknown as Joined[]) {
    const urls = [
      ...new Set(
        letter.ds_letter_sources
          .map((s) => s.paper?.landing_url ?? s.gov_press?.landing_url)
          .filter((u): u is string => Boolean(u)),
      ),
    ];
    if (urls.length === 0) continue;

    const alive = await Promise.all(urls.map(isLinkAlive));
    const dead = urls.filter((_, i) => !alive[i]);

    if (dead.length > 0) {
      alerts.push({
        code: "dead_link",
        title: `발행분 「${letter.title}」 의 원천 링크 ${dead.length}건이 열리지 않습니다`,
        detail: dead.map((u) => `· ${u}`).join("\n"),
      });
    }
  }

  return alerts;
}

export async function gatherAlerts(
  db: SupabaseClient,
  reports: SourceReport[],
): Promise<Alert[]> {
  const [stale, empty, dead] = await Promise.all([
    staleReviewAlerts(db),
    emptyPipelineAlerts(db),
    deadLinkAlerts(db),
  ]);

  return [...sourceAlerts(reports), ...stale, ...empty, ...dead];
}

/** 관리자에게만 보낸다. 보낼 것이 없으면 아무것도 하지 않는다. */
export async function sendAlertEmail(
  alerts: Alert[],
): Promise<{ sent: boolean; error: string | null }> {
  if (alerts.length === 0) return { sent: false, error: null };

  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.RADAR_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey) return { sent: false, error: "RESEND_API_KEY 없음" };
  if (to.length === 0) return { sent: false, error: "RADAR_ADMIN_EMAILS 없음" };

  const body = alerts
    .map((a) => `[${a.code}] ${a.title}\n${a.detail}`)
    .join("\n\n");

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: fromAddress(),
      to,
      subject: `[지배상식 경보] ${kstToday()} · ${alerts.length}건`,
      text: `${body}\n\n콘솔: https://gonnim.dev/dominance\n`,
    });
    if (error) return { sent: false, error: error.message };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { sent: true, error: null };
}
