// Show HN 수집 → Wiki + DB 하이브리드 (P-Trend-A-2 · Sprint W1)
// 원천: Hacker News Firebase API (인증 X · rate limit 없음)
//   - Show stories: https://hacker-news.firebaseio.com/v0/showstories.json
//   - Item: https://hacker-news.firebaseio.com/v0/item/{id}.json
// 저장: Thoughts/Trends/Show-HN/YYYY-MM-DD.md + trend_launches DB
// 실행: pnpm exec tsx scripts/fetch-show-hn.ts [--fetch=N] [--min-score=N] [--window-days=N]
// cron: 매일 09:40 KST (HF 09:35 이후)

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const HN_BASE = "https://hacker-news.firebaseio.com/v0";
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";
const TRENDS_DIR = "/Users/gonnim/GON-LLM-Wiki/Thoughts/Trends/Show-HN";
const USER_AGENT = "gonnim-landing-trend-crawler/1.0";

const DEFAULT_FETCH = 50; // 상위 N개 IDs 검토
const DEFAULT_MIN_SCORE = 10;
const DEFAULT_WINDOW_DAYS = 7;

type HnItem = {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  by?: string;
  time?: number;
  score?: number;
  descendants?: number;
  type?: string;
  deleted?: boolean;
  dead?: boolean;
};

type ParsedLaunch = {
  external_id: string;
  external_url: string;
  title: string;
  tagline: string;
  author: string;
  publishedAt: string;
  score: number;
  comments: number;
  hnDiscussionUrl: string;
  hasProjectUrl: boolean;
};

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function main() {
  const fetchCount = parseArg("fetch", DEFAULT_FETCH);
  const minScore = parseArg("min-score", DEFAULT_MIN_SCORE);
  const windowDays = parseArg("window-days", DEFAULT_WINDOW_DAYS);

  console.log(
    `\n===== Show HN Fetch @ ${new Date().toISOString()} · fetch=${fetchCount} · min-score=${minScore} · window=${windowDays}d =====`,
  );

  // 1) Show HN 상위 IDs
  const ids = await fetchJson<number[]>(`${HN_BASE}/showstories.json`);
  if (!ids) {
    console.error("showstories.json fetch 실패");
    process.exit(1);
  }
  console.log(`  raw IDs: ${ids.length}`);

  // 2) 상위 N 개 items 순차 fetch (rate limit 없으나 부하 최소화)
  const cutoffTime = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60;
  const items: HnItem[] = [];
  for (const id of ids.slice(0, fetchCount)) {
    const it = await fetchJson<HnItem>(`${HN_BASE}/item/${id}.json`);
    if (!it) continue;
    if (it.deleted || it.dead) continue;
    if (it.type !== "story") continue;
    if (!it.title) continue;
    if ((it.time ?? 0) < cutoffTime) continue;
    if ((it.score ?? 0) < minScore) continue;
    items.push(it);
  }
  console.log(`  filtered items (score ≥ ${minScore}, ≤ ${windowDays}d): ${items.length}`);

  if (items.length === 0) {
    console.log("  → 조건 매치 없음 · 스킵");
    return;
  }

  // score desc sort
  items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const launches: ParsedLaunch[] = items.map((it) => {
    const hnDiscussionUrl = `${HN_ITEM_URL}${it.id}`;
    const projectUrl = it.url && it.url.trim() ? it.url.trim() : hnDiscussionUrl;
    const rawText = it.text ? stripHtml(it.text) : "";
    const tagline = rawText
      ? rawText.slice(0, 200) + (rawText.length > 200 ? "…" : "")
      : "(설명 없음)";
    return {
      external_id: String(it.id),
      external_url: projectUrl,
      title: it.title!,
      tagline,
      author: it.by ?? "-",
      publishedAt: new Date((it.time ?? 0) * 1000).toISOString(),
      score: it.score ?? 0,
      comments: it.descendants ?? 0,
      hnDiscussionUrl,
      hasProjectUrl: !!it.url,
    };
  });

  // 3) Wiki digest
  fs.mkdirSync(TRENDS_DIR, { recursive: true });
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const filePath = path.join(TRENDS_DIR, `${dateStr}.md`);
  const ingestedTs = today.toISOString().replace("T", " ").slice(0, 19);

  const wikiExists = fs.existsSync(filePath);
  if (wikiExists) {
    console.log(`  Wiki 이미 존재 · Wiki 저장 skip · DB upsert 진행: ${filePath}`);
  } else {
    const fm = `---
title: "Show HN Digest ${dateStr}"
type: reference
domain: [trends, show-hn, hacker-news, it]
status: active
created: "${dateStr}"
provenance:
  source: web
  url: https://news.ycombinator.com/show
  source_created: "${dateStr}"
  ingested_at: "${ingestedTs}"
confidence: high
tags: [trends, show-hn, hacker-news, daily-digest]
related:
  - [[../../../_meta/Manifest]]
  - [[../../Ideas/_INDEX]]
  - [[../../Trends/_INDEX]]
---

# Show HN · ${dateStr} · ${launches.length} stories (지난 ${windowDays}d · score ≥ ${minScore})

> 자동 수집 · [HN Firebase API](${HN_BASE}/showstories.json) · score 순 · ${ingestedTs} KST
>
> **사용자 심층 분석 유도**: 관심 launch → \`Ideas/{project-slug}.md\` 로 승격 (수동)

`;
    const rows = launches
      .map(
        (l, i) => `## ${i + 1}. ${l.title}

- **Score**: ${l.score.toLocaleString()} · **Comments**: ${l.comments.toLocaleString()}
- **Author**: ${l.author} · **Published**: ${l.publishedAt}
- **Tagline**: ${l.tagline}
- **Project**: [${l.external_url}](${l.external_url})${l.hasProjectUrl ? "" : " (프로젝트 URL 없음 · HN discussion)"}
- **HN Discussion**: [${l.hnDiscussionUrl}](${l.hnDiscussionUrl})
`,
      )
      .join("\n");
    fs.writeFileSync(filePath, fm + rows, "utf8");
    console.log(`\n✓ Wiki 저장 완료: ${filePath}`);
  }

  // 4) DB upsert
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.log("  ⚠ Supabase env 없음 · DB 저장 skip");
    return;
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  let dbNew = 0;
  let dbUpdated = 0;
  const nowIso = new Date().toISOString();
  for (const l of launches) {
    const { data: existing } = await supabase
      .from("trend_launches")
      .select("id")
      .eq("source", "show-hn")
      .eq("external_id", l.external_id)
      .maybeSingle<{ id: string }>();

    const payload = {
      source: "show-hn",
      external_id: l.external_id,
      external_url: l.external_url,
      title: l.title,
      tagline: l.tagline,
      author: l.author,
      published_at: l.publishedAt,
      raw_data: {
        score: l.score,
        comments: l.comments,
        hn_discussion_url: l.hnDiscussionUrl,
        has_project_url: l.hasProjectUrl,
        ingested_at: nowIso,
      },
      last_seen_at: nowIso,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("trend_launches")
        .update(payload)
        .eq("id", existing.id);
      if (!error) dbUpdated += 1;
    } else {
      const { error } = await supabase.from("trend_launches").insert(payload);
      if (!error) dbNew += 1;
      else console.log(`  ⚠ insert 실패 ${l.title}: ${error.message}`);
    }
  }

  console.log(`  ✓ DB upsert: ${dbNew} new · ${dbUpdated} updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
