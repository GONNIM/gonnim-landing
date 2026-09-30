// Europe PMC REST · 검증(⓪-2)과 증거 모으기(②)가 함께 쓴다.
//
// 약관이 허락한 REST 만 쓴다. 요청 사이에 1.1초를 둔다. 저녁 시간에 503 이 잦아서(2026-09-28 실측)
// 간격을 늘리며 세 번까지 다시 묻는다. 전문(fullTextXML)은 대조에만 쓰고 저장하지 않는다.

import { normalizeLicense } from "./sources/license";

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const UA = "gonnim-dominance/1.0 (hi@gonnim.dev)";
const GAP_MS = 1100;

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// 한 서버 프로세스 안에서 요청 간격을 지킨다. 동시에 부르면 차례를 기다린다.
let nextSlot = 0;
async function waitTurn() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

async function get(url: string, as: "json" | "text"): Promise<unknown> {
  let last = "";
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500 * i * i + 500);
    await waitTurn();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) return as === "json" ? await res.json() : await res.text();
      last = `HTTP ${res.status}`;
      if (res.status === 404) break;
    } catch (e) {
      last = String(e);
    }
  }
  throw new Error(`Europe PMC 응답 없음 (${last})`);
}

export async function epmcSearch(
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  return (await get(
    `${REST}/search?${new URLSearchParams({ ...params, format: "json" })}`,
    "json",
  )) as Record<string, unknown>;
}

export type EpmcPaper = {
  /** "MED:12345" · "PMC:PMC123" — ds_papers.external_id 와 같은 형식 */
  externalId: string;
  source: string;
  id: string;
  pmcid: string | null;
  title: string;
  /** 태그만 걷어 낸 초록. 글자는 원문 그대로다(공백도 바꾸지 않는다). */
  abstract: string;
  year: string | null;
  doi: string | null;
  licenseRaw: string | null;
  /** 허용 목록(cc0 · cc_by · public_domain) 밖이면 null */
  license: "cc0" | "cc_by" | "public_domain" | null;
  isReview: boolean;
  authors: string[];
  firstPublicationDate: string | null;
  journal: string | null;
};

export function toEpmcPaper(x: Record<string, unknown>): EpmcPaper {
  const types = ((x.pubTypeList as { pubType?: string[] } | undefined)?.pubType ?? []).map((t) =>
    String(t).toLowerCase(),
  );
  return {
    externalId: `${x.source}:${x.id}`,
    source: String(x.source),
    id: String(x.id),
    pmcid: (x.pmcid as string) ?? null,
    title: cleanMarkup(String(x.title ?? "")).replace(/\s+/g, " ").trim(),
    abstract: cleanMarkup(String(x.abstractText ?? "")).trim(),
    year: (x.pubYear as string) ?? null,
    doi: (x.doi as string) ?? null,
    licenseRaw: (x.license as string) ?? null,
    license: normalizeLicense(x.license as string | undefined),
    isReview: types.some((t) => t.includes("review")),
    authors: String(x.authorString ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean),
    firstPublicationDate: (x.firstPublicationDate as string) ?? null,
    journal:
      ((x.journalInfo as { journal?: { title?: string } } | undefined)?.journal?.title as string) ?? null,
  };
}

export async function searchPapers(query: string, pageSize: number): Promise<EpmcPaper[]> {
  const d = await epmcSearch({ query, pageSize: String(pageSize), resultType: "core" });
  const list = ((d.resultList as { result?: unknown[] } | undefined)?.result ?? []) as Record<
    string,
    unknown
  >[];
  return list.map(toEpmcPaper);
}

/** "MED:123" · "PMC:PMC123" · "PMC123" · "123" 을 받아 논문 하나를 찾는다. */
export async function paperById(ref: string): Promise<EpmcPaper | null> {
  const r = ref.trim().replace(/^MED\//, "MED:").replace(/^PMC\//, "PMC:");
  let query: string;
  if (/^PMC:?PMC\d+$/i.test(r) || /^PMC\d+$/i.test(r)) query = `PMCID:${r.replace(/^PMC:/i, "")}`;
  else if (/^(MED:)?\d+$/.test(r)) query = `EXT_ID:${r.replace(/^MED:/, "")} AND SRC:MED`;
  else {
    const [src, id] = r.split(":");
    query = `EXT_ID:${id} AND SRC:${src}`;
  }
  const d = await epmcSearch({ query, pageSize: "1", resultType: "core" });
  const x = ((d.resultList as { result?: unknown[] } | undefined)?.result ?? [])[0];
  return x ? toEpmcPaper(x as Record<string, unknown>) : null;
}

export async function fullTextXml(pmcid: string): Promise<string | null> {
  try {
    return (await get(`${REST}/${pmcid}/fullTextXML`, "text")) as string;
  } catch {
    return null;
  }
}

// ── 글자 다루기 ─────────────────────────────────────────────────────────────

const BLOCK_TAGS =
  /<\/?(?:p|sec|title|h\d|br|li|list|list-item|abstract|caption|table-wrap|fig|label|td|tr|th|div)\b[^>]*>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** 초록 · 본문의 표시용 태그를 걷어 낸다. 문단 경계는 공백 하나, 글자 안 태그(<sup> 등)는 빈칸 없이. */
export function cleanMarkup(s: string): string {
  return decodeEntities(s.replace(BLOCK_TAGS, " ").replace(/<[^>]+>/g, ""));
}

/** 전문 XML 에서 본문(<body>)만 글자로. 표 · 그림 · 참고문헌은 뺀다. */
export function bodyText(xml: string): string {
  const body = xml.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? "";
  return cleanMarkup(
    body
      .replace(/<table-wrap[\s\S]*?<\/table-wrap>/gi, " ")
      .replace(/<fig[\s>][\s\S]*?<\/fig>/gi, " ")
      .replace(/<disp-formula[\s\S]*?<\/disp-formula>/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** 서론(intro · background) 절. 표시가 없으면 본문 첫 절. */
export function introText(xml: string, max = 6000): string {
  const body = xml.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? "";
  const secs = body.match(/<sec[\s>][\s\S]*?<\/sec>/gi) ?? [];
  const intro =
    secs.find((s) => /sec-type="intro/i.test(s)) ??
    secs.find((s) => /<title>\s*(introduction|background)/i.test(s)) ??
    secs[0] ??
    body;
  return bodyText(`<body>${intro}</body>`).slice(0, max);
}

const WS = /[\s  -​  　]/;

/**
 * 원문(source) 안에서 문장(needle)을 글자 그대로 찾는다.
 * 1) 정확히 같은 글자열 · 2) 공백 종류와 개수만 다른 글자열(특수 공백 U+2009 등).
 * 찾으면 **원문의 글자**를 그대로 돌려준다. 못 찾으면 null.
 */
export function findVerbatim(source: string, needle: string): string | null {
  const n = needle.trim();
  if (!n || !source) return null;
  if (source.includes(n)) return n;

  // 공백을 하나로 접은 글자열과, 접은 글자 → 원문 위치 표를 만든다.
  const map: number[] = [];
  let norm = "";
  let prevWs = false;
  for (let i = 0; i < source.length; i++) {
    const ws = WS.test(source[i]);
    if (ws) {
      if (!prevWs) {
        norm += " ";
        map.push(i);
      }
    } else {
      norm += source[i];
      map.push(i);
    }
    prevWs = ws;
  }
  const key = n.split("").map((c) => (WS.test(c) ? " " : c)).join("").replace(/ +/g, " ");
  const at = norm.indexOf(key);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + key.length - 1] + 1;
  return source.slice(start, end);
}
