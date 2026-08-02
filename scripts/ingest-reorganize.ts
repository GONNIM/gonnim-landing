// Clippings/summaries/ 기존 파일 도메인 폴더 자동 이관
//
// 사용:
//   pnpm ingest:reorganize --dry-run     # 이동 계획만 표시
//   pnpm ingest:reorganize               # 실제 이동
//
// 동작:
//   - INGEST_CLIPPINGS_DIR 또는 기본 경로의 최상위 .md 파일 스캔
//   - frontmatter 에서 domain 필드 파싱 (첫 번째 요소)
//   - {dir}/{domain}/ 폴더로 mv (mkdir -p)
//   - 이미 도메인 폴더 안에 있는 파일은 스킵
//   - domain 없거나 파싱 실패 시 misc/ 로 이동

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_CLIPPINGS_DIR =
  "/Users/gonnim/GON-LLM-Wiki/Clippings/summaries";

type PlanItem = {
  file: string;
  fromPath: string;
  toPath: string;
  domain: string;
  action: "move" | "skip-in-domain-dir";
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rootDir = process.env.INGEST_CLIPPINGS_DIR || DEFAULT_CLIPPINGS_DIR;

  log(`root: ${rootDir}`);
  log(`mode: ${dryRun ? "dry-run" : "실제 이동"}`);
  log("");

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const plan: PlanItem[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith(".md")) continue;

    const fromPath = path.join(rootDir, entry.name);
    const content = await fs.readFile(fromPath, "utf8");
    const domain = parseDomain(content);
    const toPath = path.join(rootDir, domain, entry.name);

    plan.push({
      file: entry.name,
      fromPath,
      toPath,
      domain,
      action: "move",
    });
  }

  if (plan.length === 0) {
    log("이동 대상 파일 없음 (이미 하위 도메인 폴더에 정리됨 or 파일 없음)");
    return;
  }

  log(`--- 이동 계획 (총 ${plan.length}건) ---`);
  const byDomain: Record<string, number> = {};
  for (const p of plan) {
    byDomain[p.domain] = (byDomain[p.domain] || 0) + 1;
    log(`  ${p.domain.padEnd(14)} ← ${p.file}`);
  }
  log("");
  log("--- 도메인별 집계 ---");
  for (const [d, c] of Object.entries(byDomain).sort()) {
    log(`  ${d.padEnd(14)}: ${c}건`);
  }
  log("");

  if (dryRun) {
    log("✓ dry-run 완료 · 실제 이동 없음 · --dry-run 없이 재실행하면 이동");
    return;
  }

  let moved = 0;
  for (const p of plan) {
    const domainDir = path.join(rootDir, p.domain);
    await fs.mkdir(domainDir, { recursive: true });
    await fs.rename(p.fromPath, p.toPath);
    moved++;
  }
  log(`✓ 완료 · ${moved}건 이동`);
}

// 최소 frontmatter parser · domain 필드만 · 첫 요소
function parseDomain(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return "misc";
  const fm = fmMatch[1];

  // domain: [trading]  또는  domain: [trading, dev]  또는  domain: trading
  const arrayMatch = fm.match(/^domain:\s*\[\s*([^,\]]+)/m);
  if (arrayMatch) return sanitize(arrayMatch[1]);

  const scalarMatch = fm.match(/^domain:\s*([^\n]+)/m);
  if (scalarMatch) return sanitize(scalarMatch[1]);

  return "misc";
}

function sanitize(raw: string): string {
  const clean = raw.replace(/["'\]]/g, "").trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return clean || "misc";
}

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

main().catch((err) => {
  log(`✗ 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
