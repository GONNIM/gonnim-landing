// db/ 의 SQL 파일 하나를 sprint-dominance 에 실행하고 결과 표와 NOTICE 를 출력한다(36차 B-1).
//
//   pnpm exec tsx scripts/dominance-sql.ts db/2026-10-01-dominance-stage4b.sql
//
// 연결 문자열은 .env.local 의 DS_DATABASE_URL 에서만 읽는다. 값은 출력하지 않는다.
// 파일 전체를 한 번에 보낸다(여러 문장 · DO 블록 포함). 결과가 있는 문장마다 표를 찍는다.
// db/ 밖의 파일은 실행하지 않는다.

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env.local") });

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("사용: tsx scripts/dominance-sql.ts db/<파일>.sql");
  const file = path.resolve(ROOT, arg);
  if (!file.startsWith(path.join(ROOT, "db") + path.sep) || !file.endsWith(".sql")) throw new Error("db/ 안의 .sql 파일만 실행한다");
  const url = process.env.DS_DATABASE_URL;
  if (!url) throw new Error("DS_DATABASE_URL 없음 · .env.local 에 넣어 주십시오(값은 어디에도 적지 않는다)");
  if (!/^postgres(ql)?:\/\//.test(url))
    throw new Error(
      "DS_DATABASE_URL 이 Postgres 연결 문자열(postgresql://… 로 시작)이 아닙니다 · Supabase → Connect → Session pooler 의 문자열을 넣어 주십시오",
    );

  const sql = readFileSync(file, "utf8");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 });
  const notices: string[] = [];
  client.on("notice", (n) => notices.push(n.message ?? String(n)));
  await client.connect();
  const t0 = Date.now();
  try {
    const res = await client.query(sql);
    const list = Array.isArray(res) ? res : [res];
    console.log(`실행: ${path.relative(ROOT, file)} · ${((Date.now() - t0) / 1000).toFixed(1)}초 · 문장 결과 ${list.length}개`);
    let k = 0;
    for (const r of list) {
      if (!r.fields?.length) continue;
      k++;
      console.log(`\n### 결과 ${k} (${r.command} · ${r.rowCount ?? r.rows.length}줄)`);
      const cols = r.fields.map((f: { name: string }) => f.name);
      console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|`);
      for (const row of r.rows) console.log(`| ${cols.map((c: string) => String(row[c] ?? "—")).join(" | ")} |`);
    }
    console.log(`\n### NOTICE ${notices.length}개`);
    for (const n of notices) console.log(`- ${n}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const e = err as { message?: string; code?: string; name?: string };
  console.error(e?.message || e?.code || e?.name || String(err));
  process.exit(1);
});
