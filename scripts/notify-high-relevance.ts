// P0-2 · 정합도 ≥7 신규 프로젝트 감지 · macOS 알림
// 크롤 완료 후 (crawl-wanted-gigs.sh 마지막 단계) or 독립 실행
// - 지난 24시간 first_seen_at + relevance_scores.score ≥ THRESHOLD
// - 이미 알림 보낸 프로젝트는 스킵 (state file · ~/.cache/gonnim-notified-projects.txt)
// - 각 매치별 알림 · 클릭 시 /radar/project/{id} 로 유도할 URL 포함
//
// 실행:
//   npx tsx scripts/notify-high-relevance.ts
//   npx tsx scripts/notify-high-relevance.ts --threshold=6   (기본 7)
//   npx tsx scripts/notify-high-relevance.ts --window=48     (기본 24 시간)

import { config } from "dotenv";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const STATE_FILE = path.join(os.homedir(), ".cache", "gonnim-notified-projects.txt");
const DEFAULT_THRESHOLD = 7;
const DEFAULT_WINDOW_HOURS = 24;
const RADAR_BASE_URL =
  process.env.RADAR_BASE_URL || "https://gonnim.dev/radar/project";

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function loadState(): Set<string> {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return new Set(raw.split("\n").map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveState(state: Set<string>) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, Array.from(state).join("\n") + "\n", "utf8");
}

function notify(title: string, message: string, sound = "Glass") {
  // AppleScript · 각 문자열 이스케이프
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display notification "${esc(message)}" with title "${esc(title)}" sound name "${sound}"`;
  try {
    execFileSync("/usr/bin/osascript", ["-e", script], { stdio: "ignore" });
  } catch {
    /* headless env · ignore */
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const threshold = parseArg("threshold", DEFAULT_THRESHOLD);
  const windowHours = parseArg("window", DEFAULT_WINDOW_HOURS);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  const cutoffIso = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  console.log(
    `\n===== High-Relevance Notifier · score ≥ ${threshold} · 지난 ${windowHours}시간 =====`,
  );

  const { data: candidates, error } = await supabase
    .from("projects")
    .select(
      `id, channel, external_url, title, budget_min, contract_type,
       relevance_scores(score), first_seen_at`,
    )
    .gte("first_seen_at", cutoffIso)
    .eq("status", "active");

  if (error) {
    console.error("query error:", error.message);
    process.exit(1);
  }

  const state = loadState();
  const matches: {
    id: string;
    channel: string;
    title: string;
    score: number;
    budget_min: number | null;
    contract_type: string | null;
  }[] = [];

  for (const row of candidates ?? []) {
    const rel = Array.isArray(row.relevance_scores) ? row.relevance_scores : [];
    const score = rel[0]?.score ?? 0;
    if (score < threshold) continue;
    if (state.has(row.id)) continue;
    matches.push({
      id: row.id,
      channel: row.channel,
      title: row.title,
      score,
      budget_min: row.budget_min,
      contract_type: row.contract_type,
    });
  }

  console.log(`  candidates: ${(candidates ?? []).length}`);
  console.log(`  new high-relevance matches: ${matches.length}`);

  if (matches.length === 0) {
    console.log("  → 조건 매치 신규 없음 · 알림 스킵");
    return;
  }

  // 요약 알림 + (매치가 3개 이하면) 개별 알림
  if (matches.length <= 3) {
    for (const m of matches) {
      const budget = m.budget_min
        ? `${(m.budget_min / 10000).toLocaleString()}만원`
        : "미공개";
      const contract = m.contract_type === "outsourcing" ? "외주" : "상주/기타";
      const shortTitle =
        m.title.length > 40 ? m.title.slice(0, 38) + "…" : m.title;
      notify(
        `🎯 정합도 ${m.score}/10 · ${m.channel}`,
        `${shortTitle}\n${contract} · ${budget}`,
      );
    }
  } else {
    // 4개 이상이면 요약 하나만
    const topThree = matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((m) => `★${m.score} ${m.title.slice(0, 24)}`)
      .join(" · ");
    notify(
      `🎯 정합도 ≥${threshold} 신규 ${matches.length}건`,
      topThree,
    );
  }

  // state 갱신
  for (const m of matches) state.add(m.id);
  saveState(state);

  console.log(`  ✓ ${matches.length}건 알림 전송 · state 갱신`);
  for (const m of matches) {
    console.log(
      `    ★ ${m.score}/10 · [${m.channel}] ${m.title.slice(0, 60)}`,
    );
    console.log(`       → ${RADAR_BASE_URL}/${m.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
