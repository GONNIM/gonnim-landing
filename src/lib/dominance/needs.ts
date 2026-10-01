// ⓪-0 Needs 지도 · 위키백과 신호 (D41 · 36차 C). 네이버 칸은 키가 오면 채운다(런북 9).
//
// 주 1회(월요일 KST) 수집한다. 위키백과 ko · en 의 일간 상위 1,000 문서를 7일치 합산하고,
// 합산 상위 3,000 문서(29일 시험과 같은 수)의 짧은 설명으로 과학 · 건강 · 의학 · 우주 · 기술 문서를 거른 뒤 10개 영역을 붙인다.
// 거르기와 영역 규칙은 29일 시험(_analysis/needs-2026-09 · 30일치 · 상위 3,000)의 규칙을 그대로 옮겼다.
// 다른 점: ① 문서 설명은 REST(page/summary)로 받고 캐시한다(예전 시험은 action API) ② 수면 · 노화·장수
// 규칙 두 줄을 더했다(예전 규칙에는 이 두 영역이 없었다) ③ 어느 영역 규칙에도 맞지 않으면 "분류되지 않음"
// (예전에는 생활 궁금증으로 넘겼다 · 운영자가 규칙의 빈틈을 보게 한다).
//
// 결과는 비공개 버킷 ds-drafts/needs/<주 시작일(월요일 KST)>.json 에 둔다. 새 표는 만들지 않는다.
// 위키백과는 REST API 만 쓰고 User-Agent 를 밝힌다.

import type { SupabaseClient } from "@supabase/supabase-js";

export const NEEDS_DIR = "needs";
const BUCKET = "ds-drafts";
const UA = "gonnim-dominance-needs/0.2 (https://gonnim.dev/sangsik; hi@gonnim.dev)";

export const AREAS10 = [
  "건강·의학",
  "노화·장수",
  "뇌·정신",
  "수면",
  "음식",
  "우주·시간",
  "AI·미래",
  "몸의 고장",
  "진화",
  "생활 궁금증",
] as const;
export const UNCLASSIFIED = "분류되지 않음";

// 29일 시험의 거르기 규칙 그대로
const KW: Record<Lang, RegExp> = {
  ko: /(질병|질환|증후군|의학|의약|약물|바이러스|세균|감염병|백신|종양|건강|해부|생물학|생물의|동물|식물|곤충|포유류|조류|어류|공룡|진화|행성|위성|항성|은하|혜성|소행성|우주|천문|물리|화학|원소|과학|수학|인공지능|컴퓨터|반도체|기술|로봇|인터넷 서비스|원자력|기후|지진|화산|태풍|수면|영양|음식|요리|심리|뇌|신경|호르몬|유전|세포|성분|현상)/i,
  en: /(disease|disorder|syndrome|medic|drug|virus|bacteri|infection|vaccine|cancer|tumou?r|health|anatom|biolog|species|animal|plant|insect|mammal|bird|fish|dinosaur|evolution|planet|moon|star|galaxy|comet|asteroid|space|astronau|spacecraft|telescope|physic|chemi|element|scien|mathemat|artificial intelligence|\bAI\b|computer|software|semiconductor|robot|nuclear|climate|earthquake|volcano|hurricane|sleep|nutrition|food|dish|psycholog|brain|neuro|hormone|gene|cell|phenomenon)/i,
};
const EXCL =
  /(film|album|song|singer|actor|actress|footballer|television|TV series|band|video game|politician|rapper|wrestler|player|배우|가수|드라마|영화|음반|축구|야구|정치인|방송|그룹|게임|아이돌|선수|코미디언|만화|애니메이션|소설)/i;
const NON_ARTICLE = /^(Main_Page|대문|Special:|특수:|위키백과:|Wikipedia:|파일:|File:|Portal:|포털:|-$)/;
// 29일 시험에서 사람이 비과학으로 걸러 낸 문서(그대로 옮김)
const MANUAL_EXCLUDE: Record<Lang, Set<string>> = {
  ko: new Set(["띠_(생초)", "백과사전", "한컴_타자연습", "네이버_(기업)", "시어도어_카진스키", "강레오", "이연복", "애플", "브로드컴", "빅웨이브로보틱스", "스마트폰", "첨성대"]),
  en: new Set(["Verity_(novel)", "Nigella_Lawson", "United_States_midterm_election", "Dwight_D._Eisenhower", "The_Beast_in_Me_(TV_series)", "Ratko_Mladić", "Skeuomorph", "Manhunters_(DC_Comics)", "El_Chapo", "Bhagat_Singh", "Che_Guevara", "Noah's_Ark", "Condoleezza_Rice", "Porn_2.0", "Friedrich_Merz", "Howard_Hughes", "Julius_Caesar", "Sachindra_Nath_Sanyal", "Ali_Hazelwood", "DuckDuckGo", "Search_engine", "Theranos", "Gay_bomb", "Tilly_Norwood", "Siti_Hasmah_Mohamad_Ali", "Amy_Acton", "Levent_Alpöge", "Vela_incident", "Long-term_nuclear_waste_warning_messages"]),
};
const SEXUAL_KO = /(사정|발기|귀두|수간|시오후키|생식_기관|유방)/;

// 29일 시험의 영역 규칙(최종판) 그대로 · 순서대로 처음 맞는 것. 수면 · 노화·장수 두 줄만 더했다(36차).
const AREA_RULES: [string, RegExp][] = [
  ["AI·미래", /(인공지능|\bai\b|gpt|openai|anthropic|앤트로픽|제미나이|언어_모델|딥페이크|artificial|\bjev\b|turing|computer|컴퓨터|월드_와이드_웹|p_versus|amodei)/i],
  ["우주·시간", /(행성|위성|항성|우주|^달$|달_착륙|아폴로|천문|planet|space|telescope|starship|^earth$|third planet|moon|astronaut|베텔게우스|로먼)/i],
  ["몸의 고장", /(병|질환|disease|hydrocephalus|glomerulo|쿠루|health_effects|abnormal)/i],
  ["수면", /(수면|불면|\bsleep|insomnia|circadian|melatonin|멜라토닌)/i],
  ["노화·장수", /(노화|장수|수명|\baging\b|ageing|longevity|senescence|lifespan)/i],
  ["뇌·정신", /(mbti|심리|뇌신경|미주신경|psych|neuroscien|daydream|stanford_prison)/i],
  ["음식", /(요리|야키니쿠|토마토|비타민|카페인|bread|khat|mitragyna)/i],
  ["진화", /(species|동물|포유류|곤충|어류|mammal|octopus|\beel\b|beetle|potoo|^cat$|고양이|너구리|삵|오소리|상어|말벌|빈대|돼지풀|gastropod|식물종|tilcayo)/i],
  ["건강·의학", /(의학|의약|아스피린|허준|이국종|체액|ibogaine|dimethylmercury|physician)/i],
  // 예전 최종판은 여기서 "." 로 나머지를 모두 생활 궁금증으로 보냈다. 36차는 예전 1판의 명시 규칙만 쓴다.
  ["생활 궁금증", /(지진|화산|태풍|hurricane|volcano|niño|climate|chernobyl|misti|체르노빌|polymorph|원소|주기율|periodic|물리|화학|수학|physicist|mathemat|chemist|과학자|퀴리|아인슈타인|뉴턴|갈릴레이|오펜하이머|양자|millennium|perelman|hawking|einstein|oppenheimer|장영실|계산화학|생명과학)/i],
];

export type Lang = "ko" | "en";
export type NeedsItem = {
  lang: Lang;
  title: string;
  views7: number;
  /** 지난주 대비 증감. 지난주 파일이 없으면 null(첫 주) */
  delta: number | null;
  area: string;
  desc: string;
  collectedAt: string;
};
export type WarmResult = { looked: number; remaining: number; ms: number };

export type NeedsWeek = {
  weekStart: string;
  days: string[];
  missingDays: string[];
  collectedAt: string;
  ms: number;
  calls: { pageviews: number; summary: number; cacheHits: number };
  /** 시간 예산 안에 설명을 다 받지 못한 문서 수(이 문서들은 이번 표에서 빠진다) */
  descMissing: number;
  firstWeek: boolean;
  items: NeedsItem[];
  /** 거르기에서 빠진 수(언어별) · 확인용 */
  excluded: Record<Lang, { nonScience: number; manual: number; sexual: number }>;
};

export function kstDate(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

/** 그 날짜가 속한 주의 월요일(KST) */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 월 0 … 일 6
  return new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
}

export function areaOf(title: string, desc: string): string {
  const s = `${title} ${desc}`.toLowerCase();
  return AREA_RULES.find(([, re]) => re.test(s))?.[0] ?? UNCLASSIFIED;
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" } });
      if (r.status === 404) return { ok: false, status: 404, json: null };
      if (r.ok) return { ok: true, status: r.status, json: await r.json() };
      if (r.status !== 429 && r.status < 500) return { ok: false, status: r.status, json: null };
    } catch {
      /* 다시 */
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return { ok: false, status: 0, json: null };
}

async function readJson<T>(db: SupabaseClient, path: string): Promise<T | null> {
  const { data } = await db.storage.from(BUCKET).download(path);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(db: SupabaseClient, path: string, value: unknown) {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, new Blob([JSON.stringify(value, null, 1)], { type: "application/json" }), { upsert: true });
  if (error) throw new Error(`Needs 파일을 쓰지 못했습니다(${path}): ${error.message}`);
}

/** 한꺼번에 n 개까지만 부른다 */
async function pool<T, R>(list: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await f(list[k]);
      }
    }),
  );
  return out;
}

/**
 * 한 주를 모아 ds-drafts/needs/<주 시작일>.json 에 쓴다(writeWeek). 아니면 설명 캐시만 채운다.
 * 7일 = 실행 시각(UTC) 기준 어제까지 7일. 월요일 07시 KST 실행이면 지난 일요일(UTC)~토요일.
 *
 * 36차 실측: 새 문서 설명 2,954개에 487초(동시 16). 한 주에 새로 들어오는 문서가 ko 1,175 · en 1,397 이어서
 * 주 1회 한 번에 받으면 함수 상한 300초를 넘는다. 그래서 크론은 매일 돌며 시간 예산(budgetMs) 안에서
 * 캐시만 채우고, 월요일에만 주 파일을 쓴다. 캐시가 찬 뒤의 수집은 2.5초였다.
 */
export async function collectNeeds(
  db: SupabaseClient,
  now = new Date(),
  opts: { budgetMs?: number; writeWeek?: boolean } = {},
): Promise<NeedsWeek> {
  const deadline = Date.now() + (opts.budgetMs ?? Infinity);
  let descMissing = 0;
  const t0 = Date.now();
  const weekStart = weekStartOf(kstDate(now));
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86400e3);
  const days = Array.from({ length: 7 }, (_, i) => new Date(yesterday.getTime() - i * 86400e3).toISOString().slice(0, 10)).reverse();
  const calls = { pageviews: 0, summary: 0, cacheHits: 0 };
  const missingDays: string[] = [];
  const prev = await readJson<NeedsWeek>(db, `${NEEDS_DIR}/${new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * 86400e3).toISOString().slice(0, 10)}.json`);
  const prevViews = new Map((prev?.items ?? []).map((x) => [`${x.lang}:${x.title}`, x.views7]));
  const items: NeedsItem[] = [];
  const excluded = { ko: { nonScience: 0, manual: 0, sexual: 0 }, en: { nonScience: 0, manual: 0, sexual: 0 } };
  const collectedAt = new Date().toISOString();

  for (const lang of ["ko", "en"] as Lang[]) {
    const agg = new Map<string, number>();
    const tops = await pool(days, 4, async (d) => {
      const [y, m, dd] = d.split("-");
      calls.pageviews++;
      return { d, r: await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${dd}`) };
    });
    for (const { d, r } of tops) {
      const arts = (r.json as { items?: { articles?: { article: string; views: number }[] }[] } | null)?.items?.[0]?.articles;
      if (!arts) {
        if (!missingDays.includes(d)) missingDays.push(d);
        continue;
      }
      for (const a of arts) agg.set(a.article, (agg.get(a.article) ?? 0) + a.views);
    }
    const top = [...agg].filter(([t]) => !NON_ARTICLE.test(t)).sort((a, b) => b[1] - a[1]).slice(0, 3000);

    // 문서 설명 · 캐시(한 번 본 문서는 다시 묻지 않는다)
    const cachePath = `${NEEDS_DIR}/desc-cache-${lang}.json`;
    const cache = (await readJson<Record<string, string>>(db, cachePath)) ?? {};
    const need = top.map(([t]) => t).filter((t) => {
      if (t in cache) {
        calls.cacheHits++;
        return false;
      }
      return true;
    });
    await pool(need, 16, async (t) => {
      if (Date.now() > deadline) return;
      calls.summary++;
      const r = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}?redirect=true`);
      cache[t] = ((r.json as { description?: string } | null)?.description ?? "").trim();
    });
    await writeJson(db, cachePath, cache);

    for (const [title, views7] of top) {
      if (!(title in cache)) {
        descMissing++;
        continue;
      }
      const desc = cache[title] ?? "";
      if (MANUAL_EXCLUDE[lang].has(title)) {
        excluded[lang].manual++;
        continue;
      }
      if (lang === "ko" && SEXUAL_KO.test(title)) {
        excluded[lang].sexual++;
        continue;
      }
      if (!KW[lang].test(desc) || EXCL.test(desc)) {
        excluded[lang].nonScience++;
        continue;
      }
      const p = prevViews.get(`${lang}:${title}`);
      items.push({ lang, title, views7, delta: prev ? views7 - (p ?? 0) : null, area: areaOf(title, desc), desc, collectedAt });
    }
  }

  const week: NeedsWeek = { weekStart, days, missingDays, collectedAt, ms: Date.now() - t0, calls, descMissing, firstWeek: !prev, items, excluded };
  if (opts.writeWeek !== false) await writeJson(db, `${NEEDS_DIR}/${weekStart}.json`, week);
  return week;
}

/** 가장 최근 주 파일 */
export async function loadLatestNeeds(db: SupabaseClient): Promise<NeedsWeek | null> {
  const { data } = await db.storage.from(BUCKET).list(NEEDS_DIR, { limit: 200, sortBy: { column: "name", order: "desc" } });
  const name = (data ?? []).map((x) => x.name).find((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
  return name ? readJson<NeedsWeek>(db, `${NEEDS_DIR}/${name}`) : null;
}
