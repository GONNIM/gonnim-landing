// db/ 의 SQL 파일 하나를 sprint-dominance 에 실행한다(36차 B-1 · 38차 A 에서 관리 API 하나로 바꿈).
//
//   pnpm exec tsx scripts/dominance-sql.ts --check                              select 1 로 통하는지만 본다
//   pnpm exec tsx scripts/dominance-sql.ts db/2026-10-01-dominance-stage4b.sql  파일 전문을 보낸다
//
// 통로는 Supabase 관리 API 의 "Run a query" 하나다.
//   POST https://api.supabase.com/v1/projects/{ref}/database/query · Authorization: Bearer SUPABASE_ACCESS_TOKEN
//   body {"query": "<SQL 전문>"} · ref 는 DS_SUPABASE_URL 의 호스트 앞부분.
// 토큰 값은 어디에도 출력하지 않는다. 이 끝점은 마지막 결과 표 하나만 돌려주고 NOTICE 는 돌려주지 않는다.
// db/ 밖의 파일과 drop database · drop schema 가 든 파일은 보내지 않는다.

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env.local"), quiet: true });

export type Row = Record<string, unknown>;

function projectRef(): string {
  const host = new URL(process.env.DS_SUPABASE_URL ?? "http://x").hostname;
  if (!host.endsWith(".supabase.co")) throw new Error("DS_SUPABASE_URL 에서 프로젝트 ref 를 뽑지 못했습니다");
  return host.split(".")[0];
}

/** SQL 하나를 관리 API 로 보내 마지막 결과 표를 돌려준다. 실패하면 API 문구 그대로 던진다. */
export async function runQuery(query: string): Promise<{ rows: Row[]; ms: number; ref: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN 없음 · supabase.com → Account → Access Tokens 에서 만들어 .env.local 에 넣어 주십시오");
  const ref = projectRef();
  const t0 = Date.now();
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`관리 API ${r.status}: ${text.slice(0, 600)}`);
  const json = JSON.parse(text) as unknown;
  return { rows: Array.isArray(json) ? (json as Row[]) : [], ms: Date.now() - t0, ref };
}

export function printTable(title: string, rows: Row[]) {
  console.log(`\n### ${title} (${rows.length}줄)`);
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  console.log(`| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|`);
  for (const row of rows) console.log(`| ${cols.map((c) => String(row[c] ?? "—")).join(" | ")} |`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("사용: tsx scripts/dominance-sql.ts --check | db/<파일>.sql");
  if (arg === "--check") {
    const { rows, ms, ref } = await runQuery("select 1 as ok");
    console.log(`통함 · 프로젝트 ${ref} · ${(ms / 1000).toFixed(1)}초`);
    printTable("select 1", rows);
    return;
  }
  const file = path.resolve(ROOT, arg);
  if (!file.startsWith(path.join(ROOT, "db") + path.sep) || !file.endsWith(".sql")) throw new Error("db/ 안의 .sql 파일만 실행한다");
  const sql = readFileSync(file, "utf8");
  const danger = sql
    .replace(/--[^\n]*/g, "")
    .match(/\bdrop\s+(database|schema)\b/i);
  if (danger) throw new Error(`파일에 "${danger[0]}" 가 있어 보내지 않습니다`);
  const { rows, ms, ref } = await runQuery(sql);
  console.log(`실행: ${path.relative(ROOT, file)} · 프로젝트 ${ref} · ${(ms / 1000).toFixed(1)}초`);
  printTable("마지막 결과", rows);
  console.log("\n(이 끝점은 마지막 결과 표만 돌려주고 NOTICE 는 돌려주지 않습니다)");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    const e = err as { message?: string; code?: string; name?: string };
    console.error(e?.message || e?.code || e?.name || String(err));
    process.exit(1);
  });
}
