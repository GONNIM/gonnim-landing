// Personal Ingest CLI · URL·텍스트·파일 → z.ai 요약 → Obsidian Clippings
//
// 사용:
//   pnpm ingest:personal "https://..."
//   pbpaste | pnpm ingest:personal --stdin
//   pnpm ingest:personal --file ~/Downloads/article.txt

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { extractFromText, extractFromUrl } from "../src/lib/content-ingest/extract";
import { summarize } from "../src/lib/content-ingest/summarize";
import { saveClipping } from "../src/lib/content-ingest/save-clipping";
import type { ExtractedContent } from "../src/lib/content-ingest/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

type Args = {
  mode: "url" | "stdin" | "file";
  value: string | null;
  useVision: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();

  const content = await loadContent(args);

  log(`✓ 본문 확보 · source=${content.source} · length=${content.text.length}자` + (content.title ? ` · "${content.title}"` : ""));

  const summary = await summarize(content);
  log(`✓ 요약 · domain=${summary.domain} · insights=${summary.insights.length} · tags=[${summary.tags.join(", ")}]`);

  const saved = await saveClipping(content, summary);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  log(`✓ 저장 · ${saved.path}`);
  log(`✓ 완료 · ${elapsed}초`);
  log("");
  log("--- 요약 ---");
  for (const line of summary.summary) log(`- ${line}`);
  log("");
  log("--- 인사이트 ---");
  for (const line of summary.insights) log(`- ${line}`);
}

async function loadContent(args: Args): Promise<ExtractedContent> {
  const extractOpts = { useVision: args.useVision };
  if (args.mode === "url") {
    if (!args.value) throw new Error("URL 이 비어 있습니다");
    log(`→ URL fetch: ${args.value}${args.useVision ? " (vision on)" : ""}`);
    return extractFromUrl(args.value, extractOpts);
  }
  if (args.mode === "file") {
    if (!args.value) throw new Error("--file 경로가 비어 있습니다");
    log(`→ 파일 읽기: ${args.value}`);
    const text = await fs.readFile(args.value, "utf8");
    return extractFromText(text);
  }
  log("→ stdin 읽기");
  const text = await readStdin();
  if (!text.trim()) throw new Error("stdin 입력이 비어 있습니다");
  // stdin 이 URL 하나면 URL 모드로 처리
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/.test(trimmed)) {
    log(`→ stdin URL 감지: ${trimmed}${args.useVision ? " (vision on)" : ""}`);
    return extractFromUrl(trimmed, extractOpts);
  }
  return extractFromText(text);
}

function parseArgs(argv: string[]): Args {
  let mode: Args["mode"] = "url";
  let value: string | null = null;
  let useVision = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stdin") {
      mode = "stdin";
      value = null;
    } else if (a === "--file") {
      mode = "file";
      value = argv[i + 1] || null;
      i++;
    } else if (a === "--vision") {
      useVision = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else if (a.startsWith("--")) {
      throw new Error(`알 수 없는 옵션: ${a}`);
    } else if (!value && mode === "url") {
      value = a;
    }
  }
  if (mode === "url" && !value) {
    printUsage();
    process.exit(1);
  }
  return { mode, value, useVision };
}

function printUsage(): void {
  log(`Personal Ingest · URL·텍스트·파일 → z.ai 요약 → Obsidian Clippings

사용:
  pnpm ingest:personal "https://..."
  pbpaste | pnpm ingest:personal --stdin
  pnpm ingest:personal --file ~/Downloads/article.txt
  pnpm ingest:personal --vision "https://www.threads.com/..."   # 이미지 텍스트 추출 (Threads 등)

옵션:
  --vision                  이미지 게시물 (Threads/Instagram) 이미지 텍스트 추출 (z.ai GLM-4.6V)

환경변수:
  ZAI_API_KEY               필수 · z.ai GLM-5.2 API 키
  ZAI_MODEL                 선택 · 기본 glm-5.2
  ZAI_BASE_URL              선택 · 기본 https://api.z.ai/api/paas/v4
  INGEST_CLIPPINGS_DIR      선택 · 기본 /Users/gonnim/GON-LLM-Wiki/Clippings/summaries`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

main().catch((err) => {
  log(`✗ 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
