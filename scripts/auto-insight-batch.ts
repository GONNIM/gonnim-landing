// Sprint 자동 사업화 타당성 분석 배치 (Phase B · Sprint W1)
// 매일 15:00 KST · 크롤 완료 후 (Wanted Gigs 12:00 이후) 실행.
//
// 대상:
//   - projects.status = 'active'
//   - relevance_scores.score ≥ 5
//   - applications.insight_report IS NULL (미분석)
//   - score desc · first_seen_at desc
//   - 최대 5건/회 (일 예산 ≈ ₩500 이내 · z.ai GLM-5.2)
//
// 동작:
//   generateInsight → applications upsert
//   status 없으면 'interested' 로 생성
//   완료 시 macOS 알림 (총 X건 · A등급 발견 시 강조 알림)

import { config } from "dotenv";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { generateInsight } from "../src/lib/insight-generator";
import type { ProjectContext } from "../src/lib/draft-generator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_MAX = 5;
const DEFAULT_MIN_SCORE = 5;
const RADAR_URL = process.env.RADAR_BASE_URL || "https://gonnim.dev/radar/project";

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

type ProjectRow = ProjectContext & {
  id: string;
  first_seen_at: string;
  relevance_scores: { score: number }[] | null;
  applications: { id: string; insight_report: string | null }[] | null;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const maxItems = parseArg("max", DEFAULT_MAX);
  const minScore = parseArg("min-score", DEFAULT_MIN_SCORE);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  console.log(
    `\n===== 자동 사업화 분석 배치 · score ≥ ${minScore} · max ${maxItems}건 =====`,
  );

  // 대상 조회 (relevance_scores 조인 · applications 조인)
  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, channel, title, description, category, skills, budget_min, budget_max,
       duration_days, work_type, contract_type, location, external_url,
       first_seen_at,
       relevance_scores(score),
       applications(id, insight_report)`,
    )
    .eq("status", "active")
    .order("first_seen_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("query error:", error.message);
    process.exit(1);
  }

  const rows = ((data ?? []) as unknown as ProjectRow[])
    .map((r) => ({
      ...r,
      score: r.relevance_scores?.[0]?.score ?? 0,
      hasInsight: !!r.applications?.[0]?.insight_report,
      applicationId: r.applications?.[0]?.id ?? null,
    }))
    .filter((r) => r.score >= minScore && !r.hasInsight)
    .sort((a, b) => (b.score - a.score) || b.first_seen_at.localeCompare(a.first_seen_at))
    .slice(0, maxItems);

  console.log(`  대상: ${rows.length}건`);
  if (rows.length === 0) {
    console.log("  → 미분석 & 조건 매치 프로젝트 없음 · 스킵");
    return;
  }

  const results: {
    id: string;
    title: string;
    grade: string | null;
    competition: string | null;
    verdict: string;
  }[] = [];
  let aCount = 0;

  for (const r of rows) {
    console.log(`\n  → ★${r.score} [${r.channel}] ${r.title.slice(0, 60)}`);
    try {
      const t0 = Date.now();
      const ctx: ProjectContext = {
        channel: r.channel,
        title: r.title,
        description: r.description,
        category: r.category,
        skills: r.skills,
        budget_min: r.budget_min,
        budget_max: r.budget_max,
        duration_days: r.duration_days,
        work_type: r.work_type,
        contract_type: r.contract_type,
        location: r.location,
        external_url: r.external_url,
        userNote: null,
      };
      const insight = await generateInsight(ctx);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      const nowIso = new Date().toISOString();
      if (r.applicationId) {
        await supabase
          .from("applications")
          .update({
            insight_report: insight.report,
            competition_level: insight.competitionLevel,
            business_grade: insight.businessGrade,
            insight_generated_at: nowIso,
          })
          .eq("id", r.applicationId);
      } else {
        await supabase.from("applications").insert({
          project_id: r.id,
          status: "interested",
          insight_report: insight.report,
          competition_level: insight.competitionLevel,
          business_grade: insight.businessGrade,
          insight_generated_at: nowIso,
        });
      }

      console.log(
        `     판정: ${insight.competitionLevel}/${insight.businessGrade} · ${elapsed}s`,
      );
      console.log(`     ${insight.verdict}`);
      if (insight.businessGrade === "A") aCount += 1;
      results.push({
        id: r.id,
        title: r.title,
        grade: insight.businessGrade,
        competition: insight.competitionLevel,
        verdict: insight.verdict,
      });
    } catch (e) {
      console.error(`     실패:`, e instanceof Error ? e.message : e);
    }
  }

  // 요약 알림
  const nA = results.filter((x) => x.grade === "A").length;
  const nB = results.filter((x) => x.grade === "B").length;
  const summary = `${results.length}건 분석 · A ${nA} · B ${nB}`;
  console.log(`\n===== 완료 · ${summary} =====`);

  if (aCount > 0) {
    const topA = results.find((x) => x.grade === "A");
    if (topA) {
      notify(
        `🎯 A등급 사업 아이템 ${aCount}건 발견`,
        `${topA.title.slice(0, 50)}\n${RADAR_URL}/${topA.id}`,
        "Glass",
      );
    }
  } else {
    notify(`자동 사업화 분석 완료`, summary);
  }

  for (const r of results) {
    console.log(`  [${r.competition}/${r.grade}] ${r.title.slice(0, 60)}`);
    console.log(`    ${r.verdict}`);
    console.log(`    ${RADAR_URL}/${r.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
