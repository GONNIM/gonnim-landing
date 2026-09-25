// 지배상식 수집기를 손으로 한 번 돌린다.
//
//   pnpm exec tsx scripts/dominance-collect.ts --dry   원천만 두드리고 저장하지 않는다
//   pnpm exec tsx scripts/dominance-collect.ts         sprint-dominance 에 저장한다
//
// 크론과 같은 함수를 부르므로 여기서 통과하면 크론에서도 같은 결과가 나온다.

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import { collectAll } from "../src/lib/dominance/sources";
import { collectArxiv } from "../src/lib/dominance/sources/arxiv";
import { collectEuropePmc } from "../src/lib/dominance/sources/europepmc";
import { collectGovPress } from "../src/lib/dominance/sources/gov-press";
import { collectMedrxiv } from "../src/lib/dominance/sources/medrxiv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const dry = process.argv.includes("--dry");

function line(label: string, found: number, kept: number, rejected: number) {
  console.log(
    `  ${label.padEnd(12)} 받음 ${String(found).padStart(4)} · 통과 ${String(kept).padStart(4)} · 거절 ${String(rejected).padStart(4)}`,
  );
}

async function dryRun() {
  console.log("원천을 두드립니다 (저장하지 않습니다)\n");

  const [arxiv, medrxiv, epmc, gov] = await Promise.all([
    collectArxiv(),
    collectMedrxiv(),
    collectEuropePmc(),
    collectGovPress(),
  ]);

  line("arxiv", arxiv.report.found, arxiv.papers.length, arxiv.report.rejected);
  line("medrxiv", medrxiv.report.found, medrxiv.papers.length, medrxiv.report.rejected);
  line("europepmc", epmc.report.found, epmc.papers.length, epmc.report.rejected);
  line("gov_press", gov.report.found, gov.press.length, gov.report.rejected);

  const errors = [arxiv, medrxiv, epmc, gov].flatMap((r) => r.report.errors);
  if (errors.length > 0) {
    console.log("\n오류:");
    for (const e of errors) console.log(`  ✖ ${e}`);
  }

  const licenses = new Set(
    [...arxiv.papers, ...medrxiv.papers, ...epmc.papers].map((p) => p.license),
  );
  console.log(`\n통과한 라이선스: ${[...licenses].join(", ") || "없음"}`);

  const sample = medrxiv.papers[0] ?? epmc.papers[0] ?? arxiv.papers[0];
  if (sample) {
    console.log("\n표본 한 건:");
    console.log(`  ${sample.title.slice(0, 70)}`);
    console.log(`  ${sample.source} · ${sample.license} (${sample.license_raw})`);
    console.log(`  ${sample.landing_url}`);
  }

  const press = gov.press[0];
  if (press) {
    console.log("\n보도자료 표본:");
    console.log(`  ${press.title.slice(0, 70)}`);
    console.log(`  ${press.published_date} · 본문 ${press.body?.length ?? 0}자`);
    console.log(`  ${press.attribution}`);
  }
}

async function wetRun() {
  const url = process.env.DS_SUPABASE_URL;
  const key = process.env.DS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("DS_SUPABASE_URL / DS_SUPABASE_SERVICE_ROLE_KEY 없음");
    process.exit(1);
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("수집해서 sprint-dominance 에 저장합니다\n");
  const summary = await collectAll(db);

  for (const r of summary.reports) {
    line(r.source, r.found, r.found - r.rejected, r.rejected);
    for (const e of r.errors) console.log(`    ✖ ${e}`);
  }

  console.log(
    `\n새로 저장: 논문 ${summary.insertedPapers}건 · 보도자료 ${summary.insertedPress}건`,
  );
  console.log("(이미 있는 행은 UNIQUE 제약이 막으므로 0 이어도 정상입니다)");
}

(dry ? dryRun() : wetRun()).catch((err) => {
  console.error(err);
  process.exit(1);
});
