// IT 트렌드 launch 사업화 signal 판정 배치 (P-LLM-Judge · Sprint W1)
// 대상: trend_launches.llm_business_grade IS NULL
// 실행: pnpm exec tsx scripts/judge-trend-launches.ts [--max=N] [--source=X]
// cron: 매일 10:00 KST (Product Hunt 09:30 크롤 이후)
//
// 정책:
//   - 미판정 (grade IS NULL) 만 대상 · 최대 max 건/실행 (기본 20)
//   - published_at 최신순
//   - source 필터 옵션 (예: --source=product-hunt)
//   - macOS 알림 (판정 완료 · A 등급 발견 시 강조)

import { config } from "dotenv";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { judgeTrendLaunch, type TrendJudgeInput } from "../src/lib/trend-judge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_MAX = 20;
const RADAR_URL =
  process.env.RADAR_BASE_URL || "https://gonnim.dev/radar/insights";

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parseStr(name: string): string | null {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return null;
  return raw.split("=")[1] ?? null;
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

type Row = TrendJudgeInput & { id: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const maxItems = parseArg("max", DEFAULT_MAX);
  const sourceFilter = parseStr("source");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  console.log(
    `\n===== Trend Judge Batch @ ${new Date().toISOString()} · max=${maxItems}${sourceFilter ? ` · source=${sourceFilter}` : ""} =====`,
  );

  let query = supabase
    .from("trend_launches")
    .select(
      "id, source, title, tagline, author, published_at, external_url",
    )
    .is("llm_business_grade", null)
    .order("published_at", { ascending: false })
    .limit(maxItems);
  if (sourceFilter) query = query.eq("source", sourceFilter);

  const { data, error } = await query.returns<Row[]>();
  if (error) {
    console.error("query error:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log(`  대상: ${rows.length}건 (미판정)`);
  if (rows.length === 0) {
    console.log("  → 미판정 없음 · 스킵");
    return;
  }

  let aCount = 0;
  let bCount = 0;
  const gradeAExamples: { title: string; pain: string }[] = [];
  const errors: string[] = [];

  for (const r of rows) {
    console.log(`\n  → [${r.source}] ${r.title.slice(0, 60)}`);
    try {
      const t0 = Date.now();
      const result = await judgeTrendLaunch(r);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      const { error: updErr } = await supabase
        .from("trend_launches")
        .update({
          llm_business_grade: result.grade,
          llm_market_pain: result.marketPain,
          llm_analyzed_at: new Date().toISOString(),
          raw_data: { reasoning: result.reasoning },
        })
        .eq("id", r.id);
      if (updErr) {
        errors.push(`${r.title}: update fail · ${updErr.message}`);
        continue;
      }

      console.log(`    판정: ${result.grade} · ${elapsed}s`);
      console.log(`    Pain: ${result.marketPain.slice(0, 80)}`);
      if (result.grade === "A") {
        aCount += 1;
        gradeAExamples.push({ title: r.title, pain: result.marketPain });
      } else if (result.grade === "B") bCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${r.title}: ${msg}`);
      console.log(`    ⚠ 실패: ${msg}`);
    }
  }

  console.log(`\n===== 완료 · ${rows.length}건 판정 · A ${aCount} · B ${bCount} =====`);

  if (aCount > 0 && gradeAExamples[0]) {
    notify(
      `🎯 A등급 트렌드 ${aCount}건 발견`,
      `${gradeAExamples[0].title.slice(0, 50)}\n${gradeAExamples[0].pain.slice(0, 80)}\n${RADAR_URL}`,
      "Glass",
    );
  } else {
    notify(
      `트렌드 판정 완료`,
      `${rows.length}건 판정 · A ${aCount} · B ${bCount}`,
    );
  }

  if (errors.length > 0) {
    console.log(`\n⚠ 실패 ${errors.length}건:`);
    for (const e of errors) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
