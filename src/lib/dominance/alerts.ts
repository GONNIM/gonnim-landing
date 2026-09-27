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

// 경보를 두 묶음으로 나눈다. 심각도 단계가 아니라 "누가 고쳐야 하는가" 로 나눈다.
// 심각도는 읽는 사람에게 다음 행동을 알려주지 않는다. 기계가 멈춘 것과 내가 할 일이
// 남은 것은 대응이 완전히 다르고, 메일을 열었을 때 가장 먼저 알아야 할 것이 그것이다.
const BROKEN_CODES = new Set<Alert["code"]>(["step", "collect"]);

const NEXT_STEP: Record<Alert["code"], string> = {
  step: "크론 단계가 실패했습니다. 실행 기록에서 어느 단계인지 확인하십시오.",
  collect: "원천 주소 규칙이 바뀌었을 수 있습니다. 이틀 연속이면 수집기를 고쳐야 합니다.",
  stale_review: "리뷰를 끝내거나 글을 버리십시오.",
  empty_pipeline: "이슈 목록에서 글을 시작하거나, 발행 달력에서 날짜를 붙이십시오.",
  dead_link: "발행한 글의 근거가 열리지 않습니다. 정정이 필요한지 확인하십시오.",
};

const CONSOLE_URL = "https://gonnim.dev/dominance";
const RUNS_URL = "https://gonnim.dev/dominance/runs";

// 경보 본문에는 원천이 준 오류 문구와 주소가 그대로 들어온다. 바깥에서 온 글자를
// HTML 에 그대로 넣으면 메일이 깨지거나 태그가 주입된다. 그래서 먼저 막는다.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(escaped: string): string {
  return escaped.replace(
    /https?:\/\/[^\s<>"'()]+/g,
    (url) => `<a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>`,
  );
}

function detailHtml(detail: string): string {
  const lines = detail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = lines.map((line) => {
    const body = linkify(escapeHtml(line.replace(/^·\s*/, "")));
    return `<div style="margin:2px 0 2px 0;color:#334155;font-size:14px;line-height:1.6;">${
      lines.length > 1 ? "· " : ""
    }${body}</div>`;
  });

  return items.join("");
}

function alertCard(alert: Alert, broken: boolean): string {
  const accent = broken ? "#dc2626" : "#d97706";

  return `<tr><td style="padding:0 0 12px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:6px;">
    <tr><td style="padding:14px 16px;">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;">${escapeHtml(alert.code)}</div>
      <div style="margin:6px 0 8px 0;font-size:16px;font-weight:700;color:#0f172a;line-height:1.45;">${escapeHtml(alert.title)}</div>
      ${detailHtml(alert.detail)}
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9;font-size:13px;color:#64748b;">${escapeHtml(NEXT_STEP[alert.code])}</div>
    </td></tr>
  </table>
</td></tr>`;
}

function sectionHtml(label: string, alerts: Alert[], broken: boolean): string {
  if (alerts.length === 0) return "";

  return `<tr><td style="padding:8px 0 10px 0;">
  <div style="font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(label)} · ${alerts.length}건</div>
</td></tr>
${alerts.map((a) => alertCard(a, broken)).join("")}`;
}

function button(href: string, label: string, primary: boolean): string {
  const bg = primary ? "#0f172a" : "#ffffff";
  const fg = primary ? "#ffffff" : "#0f172a";
  const border = primary ? "#0f172a" : "#cbd5e1";

  return `<a href="${href}" style="display:inline-block;padding:10px 18px;margin:0 6px 6px 0;background:${bg};color:${fg};border:1px solid ${border};border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`;
}

export function renderAlertEmail(alerts: Alert[], date: string): string {
  const broken = alerts.filter((a) => BROKEN_CODES.has(a.code));
  const todo = alerts.filter((a) => !BROKEN_CODES.has(a.code));

  const summary = [
    broken.length > 0 ? `고장 ${broken.length}건` : "",
    todo.length > 0 ? `할 일 ${todo.length}건` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>지배상식 경보 ${escapeHtml(date)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(summary)} — ${escapeHtml(alerts[0]?.title ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:600px;max-width:100%;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">

    <tr><td style="padding:0 0 16px 0;">
      <div style="font-size:18px;font-weight:800;color:#0f172a;">지배상식 경보</div>
      <div style="margin-top:4px;font-size:13px;color:#64748b;">${escapeHtml(date)} · ${escapeHtml(summary)}</div>
    </td></tr>

    ${sectionHtml("기계가 멈췄습니다", broken, true)}
    ${sectionHtml("내가 할 일", todo, false)}

    <tr><td style="padding:10px 0 0 0;">
      ${button(CONSOLE_URL, "콘솔 열기", true)}${button(RUNS_URL, "실행 기록 보기", false)}
    </td></tr>

    <tr><td style="padding:18px 0 0 0;border-top:1px solid #e2e8f0;margin-top:12px;">
      <div style="font-size:12px;color:#94a3b8;line-height:1.7;">
        이 메일은 살펴볼 것이 있을 때만 옵니다. 아무 문제가 없는 날에는 오지 않습니다.<br>
        매일 오는 정상 알림을 만들지 않는 이유는, 그것이 쌓이면 진짜 경보도 함께 묻히기 때문입니다.
      </div>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
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

  const date = kstToday();

  // 글자 본문도 함께 보낸다. HTML 을 막아 둔 메일 앱과 알림 미리보기가 이것을 읽는다.
  const text = alerts
    .map((a) => `[${a.code}] ${a.title}\n${a.detail}\n→ ${NEXT_STEP[a.code]}`)
    .join("\n\n");

  const brokenCount = alerts.filter((a) => BROKEN_CODES.has(a.code)).length;
  const subject =
    brokenCount > 0
      ? `[지배상식] 고장 ${brokenCount}건 · ${date}`
      : `[지배상식] 할 일 ${alerts.length}건 · ${date}`;

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: fromAddress(),
      to,
      subject,
      html: renderAlertEmail(alerts, date),
      text: `${text}\n\n콘솔: ${CONSOLE_URL}\n실행 기록: ${RUNS_URL}\n`,
    });
    if (error) return { sent: false, error: error.message };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { sent: true, error: null };
}
