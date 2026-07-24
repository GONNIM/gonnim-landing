// Sprint Radar 매일 브리핑 · 첫 결제 지원 도구
// 매일 08:30 KST · 사용자 30분 실 지원 세션 직전 참조용.
//
// 대상:
//   - projects.status = 'active'
//   - relevance_scores.score >= 6
//   - first_seen_at 최근 24h (신규 · 이전 봤을 가능성 낮음)
//   - 상위 5건 · score desc · first_seen_at desc
//
// 출력:
//   - macOS 알림 (요약 · 5건)
//   - Daily 노트 (Thoughts/Daily/YYYY-MM/YYYY-MM-DD.md) 에 § Sprint Radar Brief 섹션 append
//
// 실행:
//   pnpm exec tsx scripts/daily-radar-brief.ts [--min-score=N] [--window=H] [--top=N]

import { config } from "dotenv";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_MIN_SCORE = 6;
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_TOP = 5;

const RADAR_URL = "https://gonnim.dev/radar/project";
const WIKI_DAILY_BASE = "/Users/gonnim/GON-LLM-Wiki/Thoughts/Daily";

const CHANNEL_LABEL: Record<string, string> = {
  wishket: "위시켓",
  "wanted-gigs": "원티드 긱스",
};

const CONTRACT_LABEL: Record<string, string> = {
  outsourcing: "외주",
  contractor: "상주",
  "part-time": "파트타임",
};

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function notify(title: string, message: string, sound = "Glass") {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display notification "${esc(message)}" with title "${esc(title)}" sound name "${sound}"`;
  try {
    execFileSync("/usr/bin/osascript", ["-e", script], { stdio: "ignore" });
  } catch {
    /* headless · ignore */
  }
}

function todayDaily(): { date: string; month: string; path: string } {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;
  const month = `${yyyy}-${mm}`;
  return {
    date,
    month,
    path: path.join(WIKI_DAILY_BASE, month, `${date}.md`),
  };
}

type ProjectRow = {
  id: string;
  channel: string;
  title: string;
  category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  duration_days: number | null;
  work_type: string | null;
  contract_type: string | null;
  external_url: string;
  first_seen_at: string;
  relevance_scores: { score: number }[] | null;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const minScore = parseArg("min-score", DEFAULT_MIN_SCORE);
  const windowH = parseArg("window", DEFAULT_WINDOW_HOURS);
  const top = parseArg("top", DEFAULT_TOP);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  const cutoffIso = new Date(Date.now() - windowH * 60 * 60 * 1000).toISOString();
  console.log(
    `\n===== Daily Radar Brief @ ${new Date().toISOString()} · score≥${minScore} · ${windowH}h · top ${top} =====`,
  );

  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, channel, title, category, budget_min, budget_max, duration_days,
       work_type, contract_type, external_url, first_seen_at,
       relevance_scores(score)`,
    )
    .eq("status", "active")
    .gte("first_seen_at", cutoffIso)
    .returns<ProjectRow[]>();

  if (error) {
    console.error("query error:", error.message);
    process.exit(1);
  }

  const candidates = (data ?? [])
    .map((p) => ({ ...p, score: p.relevance_scores?.[0]?.score ?? 0 }))
    .filter((p) => p.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score || b.first_seen_at.localeCompare(a.first_seen_at),
    )
    .slice(0, top);

  console.log(`  대상: ${candidates.length}건`);

  const daily = todayDaily();
  const dailyExists = fs.existsSync(daily.path);

  // Daily 노트 § Sprint Radar Brief 섹션 조립
  const nowStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  let section = `\n## Sprint Radar Brief · ${nowStr}\n\n`;
  section += `> 매일 08:30 자동 브리핑 · 정합도 ${minScore}+ · 지난 ${windowH}h · 상위 ${top}건 · [gonnim.dev/radar](${RADAR_URL.replace("/project", "")})\n\n`;

  if (candidates.length === 0) {
    section += `_(신규 상위 프로젝트 없음 · 매일 30분 지원 세션 · [/radar/projects](${RADAR_URL.replace("/project", "/projects")}) 확인)_\n`;
  } else {
    for (let i = 0; i < candidates.length; i += 1) {
      const p = candidates[i];
      const budget =
        p.budget_min != null && p.budget_max != null && p.budget_min !== p.budget_max
          ? `${(p.budget_min / 10000).toLocaleString()}~${(p.budget_max / 10000).toLocaleString()}만원`
          : p.budget_min != null
            ? `${(p.budget_min / 10000).toLocaleString()}만원`
            : "미공개";
      const contract = p.contract_type ? CONTRACT_LABEL[p.contract_type] ?? p.contract_type : "-";
      const work = p.work_type ?? "-";
      const chan = CHANNEL_LABEL[p.channel] ?? p.channel;
      const cat = p.category ?? "-";
      section += `### ${i + 1}. ★${p.score} · [${chan}] ${p.title}\n\n`;
      section += `- **카테고리**: ${cat} · **${contract}/${work}** · **${budget}** · ${p.duration_days ?? "?"}일\n`;
      section += `- **Radar 상세**: ${RADAR_URL}/${p.id}\n`;
      section += `- **원 공고**: ${p.external_url}\n`;
      section += `- **액션 결정**: [ ] 지원 · [ ] 스킵\n\n`;
    }
  }

  // Daily 노트 append (있으면 append · 없으면 skip · daily-lint 가 곧 생성)
  if (dailyExists) {
    // 중복 방지: 이미 오늘 브리핑 section 존재 시 skip
    const existing = fs.readFileSync(daily.path, "utf8");
    if (existing.includes("## Sprint Radar Brief")) {
      console.log(`  Daily 이미 브리핑 존재 · append skip: ${daily.path}`);
    } else {
      fs.appendFileSync(daily.path, section, "utf8");
      console.log(`  Daily append 완료: ${daily.path}`);
    }
  } else {
    console.log(`  Daily 미존재 · skip (09:00 daily-lint 자동 생성 후 재실행 or 다음 날)`);
  }

  // macOS 알림
  if (candidates.length === 0) {
    notify(
      "Sprint Radar Brief",
      `신규 상위 (score≥${minScore}) 없음 · /radar 확인`,
    );
  } else {
    const topOne = candidates[0];
    const budget =
      topOne.budget_min != null
        ? `${(topOne.budget_min / 10000).toLocaleString()}만`
        : "?";
    notify(
      `🎯 Radar Brief · ${candidates.length}건 (Top ★${topOne.score})`,
      `${topOne.title.slice(0, 40)}\n${budget}원 · ${topOne.duration_days ?? "?"}일\n${RADAR_URL}/${topOne.id}`,
      "Glass",
    );
  }

  console.log(`\n✓ 완료 · ${candidates.length}건 브리핑`);
  for (const c of candidates) {
    console.log(`  ★${c.score} [${c.channel}] ${c.title.slice(0, 60)}`);
    console.log(`     ${RADAR_URL}/${c.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
