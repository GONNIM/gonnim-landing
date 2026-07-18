// Crawl 실패·중단 감지 · macOS 알림 (Sprint W1 Day 5+ · 데이터 유실 방지)
// Wanted Gigs 로컬 cron 완료 후 (crawl-wanted-gigs.sh) or 독립 실행.
//
// 로직:
//   - 각 채널별 최신 crawl_logs 레코드 조회
//   - 최신 로그가 (채널별 max_age_hours) 초과 or status = failed → 경보
//   - notify-high-relevance 와 동일한 osascript 알림 방식
//
// 채널별 최대 허용 간격:
//   - wishket: 30h (Vercel Cron 매일 08:00 KST · 24h + 여유 6h)
//   - wanted-gigs: 78h (로컬 cron 월-금 12:00 · Fri→Mon 72h 갭 + 여유 6h)
//
// 실행:
//   npx tsx scripts/check-crawl-health.ts
//   npx tsx scripts/check-crawl-health.ts --strict  (실패 감지 시 exit 1)

import { config } from "dotenv";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

type ChannelConfig = {
  channel: string;
  label: string;
  maxAgeHours: number;
};

const CHANNELS: ChannelConfig[] = [
  { channel: "wishket", label: "위시켓", maxAgeHours: 30 },
  { channel: "wanted-gigs", label: "원티드 긱스", maxAgeHours: 78 },
];

function notify(title: string, message: string, sound = "Basso") {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display notification "${esc(message)}" with title "${esc(title)}" sound name "${sound}"`;
  try {
    execFileSync("/usr/bin/osascript", ["-e", script], { stdio: "ignore" });
  } catch {
    /* headless · ignore */
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const strict = process.argv.includes("--strict");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  const now = Date.now();
  console.log(
    `\n===== Crawl Health Check @ ${new Date(now).toISOString()} =====`,
  );

  const problems: {
    channel: string;
    label: string;
    kind: "missing" | "stale" | "failed";
    detail: string;
  }[] = [];

  for (const cfg of CHANNELS) {
    const { data: latest, error } = await supabase
      .from("crawl_logs")
      .select("started_at, ended_at, status, projects_found, error_message")
      .eq("channel", cfg.channel)
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error(`  [${cfg.channel}] query error:`, error.message);
      problems.push({
        channel: cfg.channel,
        label: cfg.label,
        kind: "failed",
        detail: `조회 오류: ${error.message}`,
      });
      continue;
    }

    const row = (latest ?? [])[0];
    if (!row) {
      console.log(`  [${cfg.channel}] ✗ crawl_logs 이력 없음`);
      problems.push({
        channel: cfg.channel,
        label: cfg.label,
        kind: "missing",
        detail: "이력 자체가 없음 (최초 크롤 미실행 or 테이블 초기화)",
      });
      continue;
    }

    const startedMs = new Date(row.started_at).getTime();
    const ageHours = (now - startedMs) / (1000 * 60 * 60);
    const ageStr = `${ageHours.toFixed(1)}h`;

    if (row.status === "failed") {
      console.log(
        `  [${cfg.channel}] ✗ 최신 실행 failed · ${ageStr} 전 · ${row.error_message ?? "(에러 메시지 없음)"}`,
      );
      problems.push({
        channel: cfg.channel,
        label: cfg.label,
        kind: "failed",
        detail: `${ageStr} 전 · ${row.error_message ?? "에러 메시지 없음"}`,
      });
      continue;
    }

    if (ageHours > cfg.maxAgeHours) {
      console.log(
        `  [${cfg.channel}] ⚠ 최신 실행이 ${ageStr} 전 (허용 ${cfg.maxAgeHours}h 초과) · status=${row.status}`,
      );
      problems.push({
        channel: cfg.channel,
        label: cfg.label,
        kind: "stale",
        detail: `${ageStr} 전 (허용 ${cfg.maxAgeHours}h) · status=${row.status}`,
      });
      continue;
    }

    console.log(
      `  [${cfg.channel}] ✓ ${ageStr} 전 · status=${row.status} · found=${row.projects_found}`,
    );
  }

  if (problems.length === 0) {
    console.log(`\n✓ 모든 채널 정상 (${CHANNELS.map((c) => c.channel).join(", ")})`);
    return;
  }

  // 경보 알림 (문제 채널별 개별 알림)
  for (const p of problems) {
    const kindLabel =
      p.kind === "failed" ? "실행 실패" : p.kind === "stale" ? "지연" : "이력 없음";
    notify(`⚠️ 크롤 ${kindLabel} · ${p.label}`, p.detail);
  }

  console.log(`\n⚠ 문제 ${problems.length}건 감지 · macOS 알림 전송`);
  for (const p of problems) {
    console.log(`    [${p.channel}] ${p.kind} · ${p.detail}`);
  }

  if (strict) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
