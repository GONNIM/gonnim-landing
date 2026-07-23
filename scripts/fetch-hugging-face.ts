// Hugging Face Trending Models 수집 → Wiki + DB 하이브리드 (P-Trend-G · Sprint W1)
// 원천: https://huggingface.co/api/models (default sort = trendingScore)
// 저장: Thoughts/Trends/Hugging-Face/YYYY-MM-DD.md + trend_launches DB
// 실행: pnpm exec tsx scripts/fetch-hugging-face.ts [--limit=N] [--min-downloads=N]
// cron: 매일 09:35 KST (Product Hunt 09:30 이후)

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const HF_API = "https://huggingface.co/api/models";
const HF_BASE = "https://huggingface.co";
const TRENDS_DIR =
  "/Users/gonnim/GON-LLM-Wiki/Thoughts/Trends/Hugging-Face";
const USER_AGENT = "gonnim-landing-trend-crawler/1.0";
const DEFAULT_LIMIT = 30;
const DEFAULT_MIN_DOWNLOADS = 100;

type HfModel = {
  id: string;
  likes: number;
  trendingScore: number;
  downloads: number;
  tags: string[];
  pipeline_tag: string | null;
  library_name: string | null;
  createdAt: string;
};

type ParsedLaunch = {
  external_id: string;
  external_url: string;
  title: string;
  tagline: string;
  author: string;
  publishedAt: string;
  downloads: number;
  likes: number;
  trendingScore: number;
  tags: string[];
  pipeline_tag: string | null;
  library_name: string | null;
};

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// tags array 에서 핵심 3개 뽑아 tagline 조립
function buildTagline(m: HfModel): string {
  const parts: string[] = [];
  if (m.pipeline_tag) parts.push(m.pipeline_tag);
  const meaningful = (m.tags ?? []).filter(
    (t) =>
      !t.startsWith("license:") &&
      !t.startsWith("region:") &&
      !t.startsWith("arxiv:") &&
      !t.startsWith("dataset:") &&
      !["transformers", "safetensors", "endpoints_compatible", "eval-results"].includes(t),
  );
  parts.push(...meaningful.slice(0, 3));
  const dl = m.downloads > 1000 ? `${Math.round(m.downloads / 1000)}K DL` : `${m.downloads} DL`;
  const lk = m.likes > 1000 ? `${Math.round(m.likes / 1000)}K likes` : `${m.likes} likes`;
  parts.push(`${dl}·${lk}`);
  return parts.filter(Boolean).join(" · ");
}

async function main() {
  const limit = parseArg("limit", DEFAULT_LIMIT);
  const minDownloads = parseArg("min-downloads", DEFAULT_MIN_DOWNLOADS);

  console.log(
    `\n===== Hugging Face Fetch @ ${new Date().toISOString()} · limit=${limit} · min-dl=${minDownloads} =====`,
  );

  const res = await fetch(`${HF_API}?limit=${limit}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`fetch failed · HTTP ${res.status}`);
    process.exit(1);
  }
  const raw = (await res.json()) as HfModel[];
  console.log(`  raw models: ${raw.length}`);

  const filtered = raw.filter((m) => m.downloads >= minDownloads);
  console.log(`  filtered (downloads ≥ ${minDownloads}): ${filtered.length}`);

  const launches: ParsedLaunch[] = filtered.map((m) => {
    const [author, ...rest] = m.id.split("/");
    const modelName = rest.join("/") || m.id;
    return {
      external_id: m.id,
      external_url: `${HF_BASE}/${m.id}`,
      title: modelName,
      tagline: buildTagline(m),
      author,
      publishedAt: m.createdAt,
      downloads: m.downloads,
      likes: m.likes,
      trendingScore: m.trendingScore,
      tags: m.tags ?? [],
      pipeline_tag: m.pipeline_tag,
      library_name: m.library_name,
    };
  });

  if (launches.length === 0) {
    console.log("  → 조건 매치 없음 · 스킵");
    return;
  }

  // Wiki digest
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
title: "Hugging Face Digest ${dateStr}"
type: reference
domain: [trends, hugging-face, ai, it]
status: active
created: "${dateStr}"
provenance:
  source: web
  url: ${HF_API}
  source_created: "${dateStr}"
  ingested_at: "${ingestedTs}"
confidence: high
tags: [trends, hugging-face, ai, daily-digest]
related:
  - [[../../../_meta/Manifest]]
  - [[../../Ideas/_INDEX]]
  - [[../../Trends/_INDEX]]
---

# Hugging Face Trending · ${dateStr} · ${launches.length} models

> 자동 수집 · [HF API](${HF_API}) · trendingScore 순 · ${ingestedTs} KST
>
> **사용자 심층 분석 유도**: 관심 모델 → \`Ideas/{model-slug}.md\` 로 승격 (수동)

`;
    const rows = launches
      .map(
        (l, i) => `## ${i + 1}. ${l.author}/${l.title}

- **Pipeline**: ${l.pipeline_tag ?? "-"}
- **Downloads**: ${l.downloads.toLocaleString()} · **Likes**: ${l.likes.toLocaleString()} · **Trending**: ${l.trendingScore}
- **Library**: ${l.library_name ?? "-"}
- **Tagline**: ${l.tagline}
- **Created**: ${l.publishedAt}
- **Link**: [${l.external_url}](${l.external_url})
`,
      )
      .join("\n");
    fs.writeFileSync(filePath, fm + rows, "utf8");
    console.log(`\n✓ Wiki 저장 완료: ${filePath}`);
  }

  // DB upsert
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
      .eq("source", "hugging-face")
      .eq("external_id", l.external_id)
      .maybeSingle<{ id: string }>();

    const payload = {
      source: "hugging-face",
      external_id: l.external_id,
      external_url: l.external_url,
      title: l.title,
      tagline: l.tagline,
      author: l.author,
      published_at: l.publishedAt,
      raw_data: {
        downloads: l.downloads,
        likes: l.likes,
        trending_score: l.trendingScore,
        pipeline_tag: l.pipeline_tag,
        library_name: l.library_name,
        tags: l.tags,
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
