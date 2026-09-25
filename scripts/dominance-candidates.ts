// 후보 생성을 손으로 한 번 돌린다.
//
//   pnpm exec tsx scripts/dominance-candidates.ts              오늘 날짜로 10건
//   pnpm exec tsx scripts/dominance-candidates.ts 2026-09-26   날짜 지정
//   pnpm exec tsx scripts/dominance-candidates.ts --limit 3    적게 넣어 보기
//
// 크론과 같은 함수를 부른다. LLM 을 한 번 부르므로 비용이 든다.

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import { buildCandidates } from "../src/lib/dominance/candidates";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DS_SUPABASE_URL;
  const key = process.env.DS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("DS_SUPABASE_URL / DS_SUPABASE_SERVICE_ROLE_KEY 없음");
    process.exit(1);
  }

  const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const limitRaw = arg("--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const r = await buildCandidates(db, { date, limit });

  console.log(`후보 날짜        ${r.candidateDate}`);
  console.log(`읽은 원천        ${r.scanned}건`);
  console.log(`이미 후보였음    ${r.alreadyUsed}건`);
  console.log(`신뢰 하한 미달   ${r.trustRejected}건`);
  console.log(`LLM 에 물어봄    ${r.askedLlm}건`);
  console.log(`새로 저장        ${r.inserted}건`);

  if (r.saved.length > 0) {
    console.log("\n넣은 후보:");
    for (const s of r.saved) {
      console.log(`  ${String(s.score).padStart(3)} · ${s.headline}`);
      if (s.paradoxLine) console.log(`        역설: ${s.paradoxLine}`);
    }
  }

  if (r.errors.length > 0) {
    console.log("\n오류:");
    for (const e of r.errors) console.log(`  ✖ ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
