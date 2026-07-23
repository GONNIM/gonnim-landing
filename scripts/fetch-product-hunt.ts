// Product Hunt RSS 수집 → Wiki digest (P-Trend-A · Sprint W1)
// 원천: https://www.producthunt.com/feed (Atom · 인증 X)
// 저장: Thoughts/Trends/Product-Hunt/YYYY-MM-DD.md (일자별 digest)
// 실행: pnpm exec tsx scripts/fetch-product-hunt.ts [--window=H]
// cron: 매일 09:30 KST
//
// 정책:
//   - 최근 window 시간 이내 published launches 만 저장 (기본 24h)
//   - 매일 파일 신설 · 이미 존재하면 skip (덮어쓰기 X)
//   - 상태 파일 없음 · 매일 스냅샷

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const FEED_URL = "https://www.producthunt.com/feed";
const TRENDS_DIR =
  "/Users/gonnim/GON-LLM-Wiki/Thoughts/Trends/Product-Hunt";
const USER_AGENT = "gonnim-landing-trend-crawler/1.0";

type Launch = {
  id: string;
  title: string;
  tagline: string;
  author: string;
  published: string;
  productUrl: string;
};

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main() {
  const windowHours = parseArg("window", 24);

  console.log(
    `\n===== Product Hunt Fetch @ ${new Date().toISOString()} =====`,
  );
  console.log(`  window: ${windowHours}h`);

  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`fetch failed · HTTP ${res.status}`);
    process.exit(1);
  }
  const xml = await res.text();

  // Atom · XML parsing via cheerio (xmlMode)
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries = $("entry").toArray();
  console.log(`  raw entries: ${entries.length}`);

  const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000;
  const launches: Launch[] = [];

  for (const el of entries) {
    const entry = $(el);
    const idRaw = entry.find("id").first().text().trim();
    const idMatch = idRaw.match(/Post\/(\d+)/);
    const id = idMatch ? idMatch[1] : idRaw;

    const title = entry.find("title").first().text().trim();
    const published = entry.find("published").first().text().trim();
    const author = entry.find("author > name").first().text().trim();
    const productUrl =
      entry
        .find("link[rel='alternate']")
        .first()
        .attr("href")
        ?.trim() ?? "";

    // published 24h 필터
    const publishedMs = new Date(published).getTime();
    if (!Number.isFinite(publishedMs) || publishedMs < cutoffMs) continue;

    // content HTML 에서 첫 <p> = tagline
    const contentHtml = entry.find("content").first().text();
    const $$ = cheerio.load(contentHtml);
    const tagline = $$("p").first().text().replace(/\s+/g, " ").trim();

    launches.push({
      id,
      title,
      tagline,
      author,
      published,
      productUrl,
    });
  }

  console.log(`  matched (published within ${windowHours}h): ${launches.length}`);

  if (launches.length === 0) {
    console.log("  → 이번 window 신규 launch 없음 · 파일 미생성");
    return;
  }

  // 파일 경로 · 매일 신설
  fs.mkdirSync(TRENDS_DIR, { recursive: true });
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const filePath = path.join(TRENDS_DIR, `${dateStr}.md`);

  if (fs.existsSync(filePath)) {
    console.log(`  이미 존재 · skip: ${filePath}`);
    return;
  }

  // frontmatter + digest 조립
  const ingestedTs = today.toISOString().replace("T", " ").slice(0, 19);
  const fm = `---
title: "Product Hunt Digest ${dateStr}"
type: reference
domain: [trends, product-hunt, it]
status: active
created: "${dateStr}"
provenance:
  source: web
  url: ${FEED_URL}
  source_created: "${dateStr}"
  ingested_at: "${ingestedTs}"
confidence: medium
tags: [trends, product-hunt, daily-digest, it]
related:
  - [[../../../_meta/Manifest]]
  - [[../../Ideas/_INDEX]]
  - [[../../Trends/_INDEX]]
---

# Product Hunt · ${dateStr} · ${launches.length} launches (지난 ${windowHours}h)

> 자동 수집 · [Atom RSS](${FEED_URL}) · ${ingestedTs} KST
>
> **사용자 심층 분석 유도**: 관심 launch 는 \`Ideas/{product-slug}.md\` 로 승격 (수동)

`;

  const rows = launches
    .map(
      (l, i) => `## ${i + 1}. ${l.title}

- **Tagline**: ${l.tagline || "(설명 없음)"}
- **Author**: ${l.author || "-"}
- **Published**: ${l.published}
- **Link**: [${l.productUrl}](${l.productUrl})
- **ID**: \`${l.id}\`
`,
    )
    .join("\n");

  fs.writeFileSync(filePath, fm + rows, "utf8");
  console.log(`\n✓ 저장 완료: ${filePath}`);
  console.log(`  ${launches.length} launches`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
