// 채용공고 LLM 판정 배치 (Q4-Step4 · Sprint W1)
// 대상: job_postings.llm_business_grade IS NULL
// 실행: pnpm exec tsx scripts/judge-jobs.ts [--max=N] [--source=X]
// cron: 매일 10:05 KST (trend-judge 10:00 이후)

import { config } from "dotenv";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { judgeJob, type JobJudgeInput } from "../src/lib/job-judge";

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

type Row = JobJudgeInput & { id: string; source: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const maxItems = parseArg("max", DEFAULT_MAX);
  const sourceFilter = parseStr("source");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  console.log(
    `\n===== Job Judge Batch @ ${new Date().toISOString()} · max=${maxItems}${sourceFilter ? ` · source=${sourceFilter}` : ""} =====`,
  );

  let query = supabase
    .from("job_postings")
    .select(
      "id, source, title, company, company_industry, main_tasks, requirements, preferred_points, skill_tags, external_url",
    )
    .is("llm_business_grade", null)
    .order("first_seen_at", { ascending: false })
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
    console.log("  → 미판정 없음 · skip");
    return;
  }

  let aCount = 0;
  let bCount = 0;
  const gradeAExamples: { title: string; company: string; signal: string; url: string }[] = [];

  for (const r of rows) {
    console.log(`\n  → [${r.source}] ${r.company} · ${r.title.slice(0, 60)}`);
    try {
      const t0 = Date.now();
      const result = await judgeJob(r);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      const { error: updErr } = await supabase
        .from("job_postings")
        .update({
          llm_market_signal: result.marketSignal,
          llm_user_asset_match: result.userAssetMatch,
          llm_business_grade: result.grade,
          llm_analyzed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (updErr) {
        console.log(`    ⚠ update 실패: ${updErr.message}`);
        continue;
      }

      console.log(`    판정: ${result.grade} · ${elapsed}s`);
      console.log(`    Signal: ${result.marketSignal.slice(0, 80)}`);
      console.log(`    Asset: ${result.userAssetMatch.slice(0, 80)}`);

      if (result.grade === "A") {
        aCount += 1;
        gradeAExamples.push({
          title: r.title,
          company: r.company,
          signal: result.marketSignal,
          url: r.external_url,
        });
      } else if (result.grade === "B") bCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`    ⚠ 실패: ${msg}`);
    }
  }

  console.log(`\n===== 완료 · ${rows.length}건 판정 · A ${aCount} · B ${bCount} =====`);

  if (aCount > 0 && gradeAExamples[0]) {
    notify(
      `🎯 A등급 시장 signal ${aCount}건 (Wanted)`,
      `${gradeAExamples[0].company} · ${gradeAExamples[0].title.slice(0, 40)}\n${gradeAExamples[0].signal.slice(0, 80)}\n${RADAR_URL}`,
      "Glass",
    );
  } else {
    notify(
      `Job Judge 완료`,
      `${rows.length}건 판정 · A ${aCount} · B ${bCount}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
