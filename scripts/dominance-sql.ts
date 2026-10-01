// db/ 의 SQL 파일 하나를 sprint-dominance 에 실행하고 결과 표와 NOTICE 를 출력한다(36차 B-1).
//
//   pnpm exec tsx scripts/dominance-sql.ts db/2026-10-01-dominance-stage4b.sql
//
// 통로는 둘이다(38차 B). 있는 것을 쓴다. 값은 출력하지 않는다.
//   ① DS_DATABASE_URL(postgresql://…) — Postgres 에 바로 접속한다. 결과 표 전부와 NOTICE 를 보인다.
//   ② SUPABASE_ACCESS_TOKEN — Supabase 관리 API(POST /v1/projects/{ref}/database/query).
//      ref 는 DS_SUPABASE_URL 에서 뽑는다. 이 통로는 마지막 결과 표 하나만 돌려주고 NOTICE 는 없다.
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

type Table = { title: string; rows: Record<string, unknown>[] };

function printTable({ title, rows }: Table) {
  console.log(`\n### ${title} (${rows.length}줄)`);
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|`);
  for (const row of rows) console.log(`| ${cols.map((c) => String(row[c] ?? "—")).join(" | ")} |`);
}

async function viaPostgres(url: string, sql: string, label: string) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 });
  const notices: string[] = [];
  client.on("notice", (n) => notices.push(n.message ?? String(n)));
  await client.connect();
  const t0 = Date.now();
  try {
    const res = await client.query(sql);
    const list = Array.isArray(res) ? res : [res];
    console.log(`실행(① DS_DATABASE_URL): ${label} · ${((Date.now() - t0) / 1000).toFixed(1)}초 · 문장 결과 ${list.length}개`);
    let k = 0;
    for (const r of list) {
      if (!r.fields?.length) continue;
      k++;
      printTable({ title: `결과 ${k} (${r.command})`, rows: r.rows });
    }
    console.log(`\n### NOTICE ${notices.length}개`);
    for (const n of notices) console.log(`- ${n}`);
  } finally {
    await client.end();
  }
}

async function viaManagementApi(token: string, sql: string, label: string) {
  const host = new URL(process.env.DS_SUPABASE_URL ?? "").hostname;
  const ref = host.split(".")[0];
  if (!ref || !host.endsWith(".supabase.co")) throw new Error("DS_SUPABASE_URL 에서 프로젝트 ref 를 뽑지 못했습니다");
  const t0 = Date.now();
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`관리 API ${r.status}: ${text.slice(0, 400)}`);
  console.log(`실행(② SUPABASE_ACCESS_TOKEN · 프로젝트 ${ref}): ${label} · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  const json = JSON.parse(text) as unknown;
  printTable({ title: "마지막 결과", rows: Array.isArray(json) ? (json as Record<string, unknown>[]) : [] });
  console.log("\n### NOTICE — 이 통로는 NOTICE 를 돌려주지 않습니다");
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("사용: tsx scripts/dominance-sql.ts db/<파일>.sql");
  const file = path.resolve(ROOT, arg);
  if (!file.startsWith(path.join(ROOT, "db") + path.sep) || !file.endsWith(".sql")) throw new Error("db/ 안의 .sql 파일만 실행한다");
  const sql = readFileSync(file, "utf8");
  const label = path.relative(ROOT, file);

  const url = process.env.DS_DATABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (url && /^postgres(ql)?:\/\//.test(url)) return viaPostgres(url, sql, label);
  if (token) return viaManagementApi(token, sql, label);
  throw new Error(
    [
      "SQL 을 보낼 통로가 없습니다. 둘 중 하나를 .env.local 에 넣어 주십시오(값은 어디에도 적지 않는다).",
      "  ① DS_DATABASE_URL — Supabase → Connect → Session pooler 의 postgresql://… 문자열(비밀번호 채움)",
      "  ② SUPABASE_ACCESS_TOKEN — supabase.com/dashboard/account/tokens 에서 만든 개인 접근 토큰",
      url ? "  (지금 DS_DATABASE_URL 은 있지만 postgresql:// 로 시작하지 않아 쓰지 않았습니다)" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

main().catch((err) => {
  const e = err as { message?: string; code?: string; name?: string };
  console.error(e?.message || e?.code || e?.name || String(err));
  process.exit(1);
});
