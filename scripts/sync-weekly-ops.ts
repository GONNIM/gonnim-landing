// Weekly-Ops 자동 데이터 갱신 (Sprint W1 D5 · P0-1)
// 매주 일요일 20:00 crontab 트리거 · Supabase → GON-LLM-Wiki/Weekly-Ops.md append
//
// 데이터:
//   - 지난 7일 신규 프로젝트 (채널별)
//   - Application funnel 이벤트 (applied · responded · meeting · contracted)
//   - 매출 트리 실적 (누적 계약금액 vs Q1 ₩15M 목표)
//
// 사용자 4점 판단 (능동 마케팅 실적·채널 5축·매출 트리·다음 주 3점) 은
// 자동 데이터를 참조하여 별도 편집.

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

// ---------- Sprint 상수 (Sprint-Radar-Spec 정합) ----------
const KICKOFF_DATE = new Date("2026-07-07T00:00:00+09:00");
const Q1_TARGET_WON = 15_000_000;
const Q1_DEADLINE = new Date("2026-10-06T23:59:59+09:00");
const WEEKLY_OPS_PATH =
  "/Users/gonnim/GON-LLM-Wiki/Goals/2026-1억-Sprint/Weekly-Ops.md";
const INSERT_MARKER =
  "<!-- 매주 일요일 회고 후 아래에 신규 섹션 append -->";

// ---------- 유틸 ----------
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dowKo(d: Date): string {
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtWon(n: number): string {
  return `₩${n.toLocaleString()}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  // ---------- 회고 대상 주 경계 계산 ----------
  // Sprint 주 = 월요일 00:00 ~ 일요일 23:59.
  // cron 은 매주 일요일 20:00 실행 · 그날이 회고 대상 주의 마감.
  // 수동 실행 시 오늘이 속한 Sprint 주로 정렬.
  const now = new Date();
  const daysSinceKickoff = daysBetween(KICKOFF_DATE, now);
  const weekNum = Math.max(1, Math.floor(daysSinceKickoff / 7) + 1);

  // 이번 주의 월요일(00:00) ~ 일요일(23:59) 로 정렬
  // JS getDay(): 0=Sun · 1=Mon · … · 6=Sat
  const dow = now.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  console.log(
    `\n===== Weekly-Ops Sync · W${weekNum} · ${fmtDate(weekStart)}~${fmtDate(weekEnd)} =====`,
  );

  // ---------- 데이터 조회 ----------
  const startIso = weekStart.toISOString();
  const endIso = weekEnd.toISOString();

  // 이번 주 신규 프로젝트
  const { data: newProjects } = await supabase
    .from("projects")
    .select("channel, contract_type, relevance_scores(score)")
    .gte("first_seen_at", startIso)
    .lte("first_seen_at", endIso);

  // 이번 주 Application 이벤트 (여러 타임스탬프 필드 각각 확인)
  const { data: allApps } = await supabase
    .from("applications")
    .select(
      `id, status, contract_amount, applied_at, response_received_at,
       meeting_scheduled_at, contracted_at, projects(channel)`,
    );

  // 누적 계약 금액 (전체 · Q1 진척)
  const { data: contractedAll } = await supabase
    .from("applications")
    .select("contract_amount, contracted_at")
    .eq("status", "contracted");

  const contractedRevenue = (contractedAll ?? []).reduce(
    (sum, a) => sum + (a.contract_amount ?? 0),
    0,
  );
  const q1Progress = Math.min(
    100,
    Math.round((contractedRevenue / Q1_TARGET_WON) * 100),
  );
  const daysToQ1 = Math.max(
    0,
    Math.ceil((Q1_DEADLINE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // ---------- 이번 주 이벤트 카운트 ----------
  type ChannelKey = string;
  const CHANNEL_LABEL: Record<ChannelKey, string> = {
    wishket: "위시켓",
    "wanted-gigs": "원티드 긱스",
    kmong: "크몽",
    upwork: "Upwork",
    toptal: "Toptal",
  };

  type ChannelStat = {
    label: string;
    newTotal: number;
    newOutsourcing: number;
    newHighScore: number; // ≥7
    applied: number;
    responded: number;
    meeting: number;
    contracted: number;
  };
  const byCh: Record<ChannelKey, ChannelStat> = {};
  const ensureCh = (ch: string): ChannelStat => {
    if (!byCh[ch]) {
      byCh[ch] = {
        label: CHANNEL_LABEL[ch] ?? ch,
        newTotal: 0,
        newOutsourcing: 0,
        newHighScore: 0,
        applied: 0,
        responded: 0,
        meeting: 0,
        contracted: 0,
      };
    }
    return byCh[ch];
  };

  for (const p of newProjects ?? []) {
    const stat = ensureCh(p.channel);
    stat.newTotal += 1;
    if (p.contract_type === "outsourcing") stat.newOutsourcing += 1;
    const rel = Array.isArray(p.relevance_scores) ? p.relevance_scores : [];
    const score = rel[0]?.score ?? 0;
    if (score >= 7) stat.newHighScore += 1;
  }

  const inRange = (ts: string | null | undefined): boolean =>
    !!ts && ts >= startIso && ts <= endIso;

  function extractChannel(
    proj: { channel: string } | { channel: string }[] | null,
  ): string | null {
    if (!proj) return null;
    if (Array.isArray(proj)) return proj[0]?.channel ?? null;
    return proj.channel ?? null;
  }

  for (const a of allApps ?? []) {
    const ch = extractChannel(a.projects) ?? "unknown";
    const stat = ensureCh(ch);
    if (inRange(a.applied_at)) stat.applied += 1;
    if (inRange(a.response_received_at)) stat.responded += 1;
    if (inRange(a.meeting_scheduled_at)) stat.meeting += 1;
    if (inRange(a.contracted_at)) stat.contracted += 1;
  }

  const totals = Object.values(byCh).reduce(
    (acc, s) => ({
      newTotal: acc.newTotal + s.newTotal,
      newOutsourcing: acc.newOutsourcing + s.newOutsourcing,
      newHighScore: acc.newHighScore + s.newHighScore,
      applied: acc.applied + s.applied,
      responded: acc.responded + s.responded,
      meeting: acc.meeting + s.meeting,
      contracted: acc.contracted + s.contracted,
    }),
    {
      newTotal: 0,
      newOutsourcing: 0,
      newHighScore: 0,
      applied: 0,
      responded: 0,
      meeting: 0,
      contracted: 0,
    },
  );

  // 이번 주 계약 매출
  const weeklyRevenue = (contractedAll ?? [])
    .filter((a) => inRange(a.contracted_at))
    .reduce((sum, a) => sum + (a.contract_amount ?? 0), 0);

  const responseRate =
    totals.applied > 0
      ? Math.round((totals.responded / totals.applied) * 100)
      : 0;

  // ---------- 섹션 텍스트 조립 ----------
  const nowStamp = now.toISOString();
  const header = `\`${fmtDate(now)} (${dowKo(now)}) 20:00\` W${weekNum} — 자동 데이터`;

  const channelRows = Object.entries(byCh)
    .sort((a, b) => b[1].newTotal - a[1].newTotal)
    .map(
      ([, s]) =>
        `| ${s.label} | ${s.newTotal} | ${s.newOutsourcing} | ${s.newHighScore} | ${s.applied} | ${s.responded} | ${s.meeting} | ${s.contracted} |`,
    )
    .join("\n");

  const channelTable =
    Object.keys(byCh).length > 0
      ? `| 채널 | 신규 | 외주 | ≥7 | 지원 | 응답 | 미팅 | 계약 |\n|---|---|---|---|---|---|---|---|\n${channelRows}`
      : "_(수집된 데이터 없음)_";

  const section = `### ${header}

- **1) 능동 마케팅 실행 실적** (지난 7일)
  - 신규 프로젝트 총 ${totals.newTotal}건 · 외주(도급) ${totals.newOutsourcing}건 · 정합도 ≥7 ${totals.newHighScore}건
  - 지원 (applied) ${totals.applied}건 · 응답 (responded) ${totals.responded}건 · 응답률 ${responseRate}%
  - 미팅 예정 ${totals.meeting}건 · 계약 ${totals.contracted}건
- **2) 채널별 통계** (사용자 5축 점수 판단 참고 데이터)

${channelTable}

- **3) 매출 트리 실적**
  - 이번 주 계약 매출: ${fmtWon(weeklyRevenue)}
  - 누적 계약 매출: ${fmtWon(contractedRevenue)}
  - Q1 목표 ${fmtWon(Q1_TARGET_WON)} 대비 진척: ${q1Progress}% · 마감까지 ${daysToQ1}일
- **4) 다음 주 (W${weekNum + 1}) 3점 결정**: _(수동 갱신 · 회고 시 편집)_

> 자동 생성 · ${nowStamp} · [[Sprint-Radar-Spec]] P0-1 · 사용자 4점 판단은 별도 편집

---
`;

  // ---------- 파일 append ----------
  const original = fs.readFileSync(WEEKLY_OPS_PATH, "utf8");
  if (!original.includes(INSERT_MARKER)) {
    console.error(`insert marker not found in ${WEEKLY_OPS_PATH}`);
    process.exit(1);
  }
  // 이번 주 이미 append 되어있는지 확인 (W-번호 기준 중복 방지)
  const dupeCheck = new RegExp(`W${weekNum} — 자동 데이터`, "g");
  if (dupeCheck.test(original)) {
    console.log(`이미 W${weekNum} 자동 데이터 존재 · 재-append 스킵`);
    console.log(
      `manual re-run 원할 시 Weekly-Ops.md 에서 해당 섹션 삭제 후 재실행`,
    );
    return;
  }

  const updated = original.replace(
    INSERT_MARKER,
    `${INSERT_MARKER}\n\n${section}`,
  );
  fs.writeFileSync(WEEKLY_OPS_PATH, updated, "utf8");
  console.log(
    `\n✓ Weekly-Ops W${weekNum} 자동 데이터 append 완료 · ${WEEKLY_OPS_PATH}`,
  );
  console.log(
    `  신규 ${totals.newTotal} · 지원 ${totals.applied} · 응답 ${totals.responded} · 계약 ${totals.contracted} · Q1 ${q1Progress}%`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
