// Obsidian Kickoff 자동 동기화 (Phase E · Sprint W1)
// 매일 22:00 KST cron 실행 · sprint_status='kicked-off' 프로젝트를
// Kickoff.md §7 섹션에 자동 append (덤핑 방지 · project_id 기준 dedup).
//
// 전제: Kickoff.md 에 다음 마커가 있어야 함 (초기 실행 시 자동 삽입):
//   <!-- RADAR_SYNC:START -->
//   ...(자동 관리 · 수동 편집 금지)
//   <!-- RADAR_SYNC:END -->
//
// 사용:
//   pnpm exec tsx scripts/sync-kickoff.ts
//   pnpm exec tsx scripts/sync-kickoff.ts --dry-run

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const KICKOFF_PATH =
  "/Users/gonnim/GON-LLM-Wiki/Goals/2026-1억-Sprint/Kickoff.md";
const RADAR_URL = "https://gonnim.dev/radar/project";

const MARKER_START = "<!-- RADAR_SYNC:START -->";
const MARKER_END = "<!-- RADAR_SYNC:END -->";
const SECTION_HEADER = `## §7. Radar 발굴 사업 아이템 (자동 동기화)`;
const SECTION_INTRO = `> \`sync-kickoff.ts\` 가 매일 22:00 KST 자동 갱신 · **수동 편집 시 다음 동기화에 덮어씀** · 수동 메모는 §5 다음 실행 하위에 별도 작성.`;

type Row = {
  id: string;
  sprint_status: string;
  sprint_decided_at: string | null;
  business_grade: string | null;
  competition_level: string | null;
  insight_generated_at: string | null;
  projects: {
    id: string;
    channel: string;
    title: string;
    category: string | null;
    budget_min: number | null;
    budget_max: number | null;
    duration_days: number | null;
    external_url: string;
  } | null;
};

function fmtWon(n: number | null): string {
  if (n == null) return "-";
  return `${(n / 10000).toLocaleString()}만원`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

const COMPETITION_LABEL: Record<string, string> = {
  red: "🔴 Red",
  yellow: "🟡 Yellow",
  blue: "🔵 Blue",
};

const STATUS_LABEL: Record<string, string> = {
  "kicked-off": "🚀 킥오프",
  pursuing: "▶ 진행중",
};

function renderItem(r: Row): string {
  const p = r.projects!;
  const budget =
    p.budget_min != null && p.budget_max != null && p.budget_min !== p.budget_max
      ? `${fmtWon(p.budget_min)} ~ ${fmtWon(p.budget_max)}`
      : fmtWon(p.budget_min ?? p.budget_max);

  const status = STATUS_LABEL[r.sprint_status] ?? r.sprint_status;
  const compBadge = r.competition_level
    ? `${COMPETITION_LABEL[r.competition_level] ?? r.competition_level}`
    : "-";
  const grade = r.business_grade ? `등급 ${r.business_grade}` : "-";
  const decided = fmtDate(r.sprint_decided_at);
  const analyzed = fmtDate(r.insight_generated_at);

  return `### ${status} · ${p.title}

- **판정**: ${grade} · ${compBadge} · 채널 ${p.channel}
- **원본 예산·기간**: ${budget} · ${p.duration_days ?? "-"}일
- **결정 시각**: ${decided} · 분석 완료 ${analyzed}
- **Radar 상세**: ${RADAR_URL}/${p.id}
- **원 공고**: ${p.external_url}
- **다음 액션**: (사용자 편집 · 이 라인은 자동 갱신 시 유지)
`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  console.log(`\n===== Kickoff 동기화 @ ${new Date().toISOString()} =====`);

  const { data, error } = await supabase
    .from("applications")
    .select(
      `id, sprint_status, sprint_decided_at, business_grade, competition_level,
       insight_generated_at,
       projects(id, channel, title, category, budget_min, budget_max,
                duration_days, external_url)`,
    )
    .in("sprint_status", ["kicked-off", "pursuing"])
    .order("sprint_decided_at", { ascending: false });

  if (error) {
    console.error("query error:", error.message);
    process.exit(1);
  }

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.projects !== null,
  );

  console.log(
    `  대상: ${rows.length}건 (kicked-off ${rows.filter((r) => r.sprint_status === "kicked-off").length} · pursuing ${rows.filter((r) => r.sprint_status === "pursuing").length})`,
  );

  // 렌더링 · kicked-off 먼저 · 그 안에서 결정 시각 desc
  rows.sort((a, b) => {
    const pri = (s: string) => (s === "kicked-off" ? 0 : 1);
    const p = pri(a.sprint_status) - pri(b.sprint_status);
    if (p !== 0) return p;
    return (b.sprint_decided_at ?? "").localeCompare(a.sprint_decided_at ?? "");
  });

  const content = rows.map((r) => renderItem(r)).join("\n");
  const nowStamp = new Date().toISOString();
  const managedBlock = `${MARKER_START}
_(자동 갱신 · ${nowStamp} · 총 ${rows.length}건)_

${content || "_(현재 kicked-off · pursuing 상태 프로젝트 없음)_"}

${MARKER_END}`;

  const kickoffRaw = fs.readFileSync(KICKOFF_PATH, "utf8");
  const hasMarker =
    kickoffRaw.includes(MARKER_START) && kickoffRaw.includes(MARKER_END);

  let updated: string;
  if (hasMarker) {
    // 마커 사이만 교체
    const re = new RegExp(
      `${MARKER_START}[\\s\\S]*?${MARKER_END}`,
      "m",
    );
    updated = kickoffRaw.replace(re, managedBlock);
    console.log(`  마커 존재 · 관리 블록 교체`);
  } else {
    // 최초 실행 · §7 섹션 자체를 파일 끝에 append
    const section = `

---

${SECTION_HEADER}

${SECTION_INTRO}

${managedBlock}
`;
    updated = kickoffRaw.trimEnd() + section;
    console.log(`  마커 없음 · §7 섹션 신설 + 마커 배치`);
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] · 파일 미변경 · 아래 내용 삽입 예정:\n`);
    console.log(managedBlock);
    return;
  }

  if (updated === kickoffRaw) {
    console.log(`  변경 없음 · 스킵`);
    return;
  }

  fs.writeFileSync(KICKOFF_PATH, updated, "utf8");
  console.log(`\n✓ Kickoff.md 갱신 완료 · ${KICKOFF_PATH}`);
  console.log(`  ${rows.length}건 반영 · Obsidian Git 30분 자동 백업 대기`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
