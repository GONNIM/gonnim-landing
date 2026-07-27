// 원티드 채용공고 크롤 · Wiki + DB 하이브리드 (Q4 · Sprint W1)
// 원천: https://www.wanted.co.kr/api/v4/jobs (REST · 인증 X)
// 저장: Thoughts/Trends/Wanted-Jobs/YYYY-MM-DD.md + job_postings DB
// 실행: pnpm exec tsx scripts/fetch-wanted-jobs.ts [--limit=N] [--only-it]
// cron: 매일 09:45 KST (Show HN 09:40 이후)
//
// 정책:
//   - Top N latest (list API)
//   - IT/개발 관련 필터 (title keyword or category_tags parent_id=518)
//   - 필터 통과 → detail API fetch (main_tasks · skill_tags 등)
//   - Wiki digest + DB upsert (UNIQUE(source, external_id))

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

const WANTED_API_LIST =
  "https://www.wanted.co.kr/api/v4/jobs?country=kr&job_sort=job.latest_order&years=-1&locations=all";
const WANTED_API_DETAIL = "https://www.wanted.co.kr/api/v4/jobs";
const WANTED_JOB_URL = "https://www.wanted.co.kr/wd";
const TRENDS_DIR = "/Users/gonnim/GON-LLM-Wiki/Thoughts/Trends/Wanted-Jobs";
const USER_AGENT = "gonnim-landing-jobs-crawler/1.0";

const DEFAULT_LIMIT = 50;

// IT/개발 관련 title 키워드 필터 (client-side · category_tags URL 필터 안 됨)
const IT_TITLE_KEYWORDS = [
  "개발자", "엔지니어", "engineer", "developer",
  "backend", "frontend", "fullstack", "full-stack",
  "백엔드", "프론트엔드", "풀스택",
  "ai", "ml", "llm", "인공지능", "머신러닝", "딥러닝",
  "data", "데이터", "analyst", "scientist",
  "devops", "sre", "인프라", "infra",
  "ios", "android", "mobile", "모바일",
  "python", "java", "kotlin", "typescript", "react", "vue",
  "cloud", "aws", "gcp", "kubernetes", "k8s",
  "보안", "security",
  "블록체인", "blockchain",
  "게임", "unity", "unreal",
];

// 개발 카테고리 parent_id
const DEV_CATEGORY_PARENT_IDS = new Set([518]);

type ListItem = {
  id: number;
  position: string | null;
  company: { name: string; industry_name?: string };
  category_tags: { parent_id: number; id: number }[];
  annual_from: number | null;
  annual_to: number | null;
  address: { full_location?: string; location?: string };
  due_time: string | null;
};

type DetailData = {
  id: number;
  position?: string;
  company?: { name: string; industry_name?: string };
  category_tags?: { parent_id: number; id: number }[];
  annual_from?: number | null;
  annual_to?: number | null;
  address?: { full_location?: string; location?: string };
  due_time?: string | null;
  detail?: {
    main_tasks?: string;
    requirements?: string;
    preferred_points?: string;
    intro?: string;
    benefits?: string;
  };
  skill_tags?: { id: number; title: string; kind_title: string }[];
};

// Wanted detail API · { application, job, like_users } wrapper
type DetailResponse = { job: DetailData };

type Job = {
  external_id: string;
  external_url: string;
  title: string;
  company: string;
  company_industry: string | null;
  category: string | null;
  location: string | null;
  annual_from: number | null;
  annual_to: number | null;
  main_tasks: string | null;
  requirements: string | null;
  preferred_points: string | null;
  intro: string | null;
  benefits: string | null;
  skill_tags: string[];
  due_time: string | null;
};

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = Number(raw.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function isItRelevant(item: ListItem): boolean {
  // 1) category_tags · parent_id=518 (개발) 있으면 통과
  if (item.category_tags?.some((t) => DEV_CATEGORY_PARENT_IDS.has(t.parent_id))) return true;
  // 2) title keyword 매치 (fallback)
  const title = (item.position ?? "").toLowerCase();
  return IT_TITLE_KEYWORDS.some((k) => title.includes(k));
}

async function main() {
  const limit = parseArg("limit", DEFAULT_LIMIT);
  console.log(
    `\n===== Wanted Jobs Fetch @ ${new Date().toISOString()} · limit=${limit} =====`,
  );

  // 1) List API
  const listData = await fetchJson<{ data: ListItem[] }>(
    `${WANTED_API_LIST}&limit=${limit}`,
  );
  if (!listData) {
    console.error("List API fetch 실패");
    process.exit(1);
  }
  console.log(`  raw list: ${listData.data.length}`);

  // 2) IT/개발 필터
  const relevant = listData.data.filter(isItRelevant);
  console.log(`  IT/개발 필터 통과: ${relevant.length}`);

  if (relevant.length === 0) {
    console.log("  → 매치 없음 · skip");
    return;
  }

  // 3) 각 job · detail fetch (순차 · 부하 최소)
  //    응답 wrapper: { application, job, like_users } · job 안에 detail·skill_tags 있음
  const jobs: Job[] = [];
  for (const item of relevant) {
    const resp = await fetchJson<DetailResponse>(`${WANTED_API_DETAIL}/${item.id}`);
    if (!resp?.job) {
      console.log(`  detail fetch 실패 · ${item.id} · skip`);
      continue;
    }
    const detail = resp.job;
    const d = detail.detail ?? {};
    const skill = (detail.skill_tags ?? []).map((s) => s.title);
    jobs.push({
      external_id: String(item.id),
      external_url: `${WANTED_JOB_URL}/${item.id}`,
      title: item.position ?? detail.position ?? "-",
      company: item.company?.name ?? detail.company?.name ?? "-",
      company_industry:
        item.company?.industry_name ?? detail.company?.industry_name ?? null,
      category: item.category_tags?.[0]
        ? `parent:${item.category_tags[0].parent_id}/id:${item.category_tags[0].id}`
        : null,
      location: item.address?.full_location ?? item.address?.location ?? null,
      annual_from: item.annual_from ?? null,
      annual_to: item.annual_to ?? null,
      main_tasks: d.main_tasks ?? null,
      requirements: d.requirements ?? null,
      preferred_points: d.preferred_points ?? null,
      intro: d.intro ?? null,
      benefits: d.benefits ?? null,
      skill_tags: skill,
      due_time: item.due_time ?? null,
    });
  }
  console.log(`  detail fetched: ${jobs.length}`);

  // 4) Wiki digest
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
    console.log(`  Wiki 이미 존재 · Wiki 저장 skip · DB upsert 진행`);
  } else {
    const fm = `---
title: "Wanted Jobs Digest ${dateStr}"
type: reference
domain: [trends, wanted-jobs, market-signal, it]
status: active
created: "${dateStr}"
provenance:
  source: web
  url: ${WANTED_API_LIST}
  source_created: "${dateStr}"
  ingested_at: "${ingestedTs}"
confidence: high
tags: [trends, wanted-jobs, market-signal, daily-digest]
related:
  - [[../../../_meta/Manifest]]
  - [[../../Ideas/_INDEX]]
  - [[../../Trends/_INDEX]]
---

# Wanted Jobs · ${dateStr} · ${jobs.length} 채용공고 (IT/개발)

> 사용자 아이디어 (Daily 2026-07-27) · "채용공고 주요업무 = 시장이 지금 필요로 하는 것"
>
> 자동 수집 · [Wanted API v4](${WANTED_API_LIST}) · ${ingestedTs} KST
>
> **활용**: main_tasks · skill_tags 로 시장 pain·요구 파악 · 사용자 자산 매치 서비스 재정의
`;
    const rows = jobs
      .map(
        (j, i) => `\n## ${i + 1}. ${j.company} · ${j.title}\n
- **산업**: ${j.company_industry ?? "-"} · **위치**: ${j.location ?? "-"}
- **연봉**: ${j.annual_from ?? "?"}~${j.annual_to ?? "?"}만원
- **기술 스택**: ${j.skill_tags.length > 0 ? j.skill_tags.join(" · ") : "-"}
- **주요업무**:\n${j.main_tasks ? j.main_tasks.slice(0, 500) + (j.main_tasks.length > 500 ? "…" : "") : "-"}
- **자격요건**:\n${j.requirements ? j.requirements.slice(0, 300) + (j.requirements.length > 300 ? "…" : "") : "-"}
- **원 공고**: [${j.external_url}](${j.external_url})
`,
      )
      .join("\n");
    fs.writeFileSync(filePath, fm + rows, "utf8");
    console.log(`\n✓ Wiki 저장 완료: ${filePath}`);
  }

  // 5) DB upsert
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
  for (const j of jobs) {
    const { data: existing } = await supabase
      .from("job_postings")
      .select("id")
      .eq("source", "wanted")
      .eq("external_id", j.external_id)
      .maybeSingle<{ id: string }>();

    const payload = {
      source: "wanted",
      external_id: j.external_id,
      external_url: j.external_url,
      title: j.title,
      company: j.company,
      company_industry: j.company_industry,
      category: j.category,
      location: j.location,
      annual_from: j.annual_from,
      annual_to: j.annual_to,
      main_tasks: j.main_tasks,
      requirements: j.requirements,
      preferred_points: j.preferred_points,
      intro: j.intro,
      benefits: j.benefits,
      skill_tags: j.skill_tags,
      due_time: j.due_time,
      raw_data: { ingested_at: nowIso },
      last_seen_at: nowIso,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("job_postings")
        .update(payload)
        .eq("id", existing.id);
      if (!error) dbUpdated += 1;
    } else {
      const { error } = await supabase.from("job_postings").insert(payload);
      if (!error) dbNew += 1;
      else console.log(`  ⚠ insert 실패 ${j.title}: ${error.message}`);
    }
  }

  console.log(`  ✓ DB upsert: ${dbNew} new · ${dbUpdated} updated`);
  console.log(`wanted-jobs · success · fetched=${listData.data.length} filtered=${jobs.length} new=${dbNew} updated=${dbUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
