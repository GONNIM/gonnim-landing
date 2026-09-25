// Europe PMC · REST API 만 쓴다.
//
// 약관이 OAI·REST·SOAP·bulk 를 자동 수집의 유일한 인가 경로로 명시하고 크롤링을
// 금지한다. 그리고 "라이선스는 논문마다 같지 않다" 고 못박았으므로 논문별
// license 필드를 반드시 읽는다. Europe PMC 는 허가 층이 아니라 발견 층이다.

import { fetchJson } from "./http";
import { normalizeLicense } from "./license";
import type { CollectReport, RawPaper } from "./types";

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

// 미국 정부 저작이어서 퍼블릭 도메인인 저널. 2026-09-25 약관 실사분이다.
// 사진·삽화는 제3자 저작권일 수 있으므로 글자만 쓴다.
const PUBLIC_DOMAIN_JOURNALS = [
  "Emerging Infectious Diseases",
  "Environmental Health Perspectives",
  "Preventing Chronic Disease",
];

type Result = {
  id: string;
  source: string;
  doi?: string;
  title: string;
  abstractText?: string;
  firstPublicationDate?: string;
  license?: string;
  isOpenAccess?: string;
  authorString?: string;
  journalInfo?: { journal?: { title?: string } };
};

type Response = { resultList?: { result?: Result[] } };

function dateRange(days: number): string {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return `[${from.toISOString().slice(0, 10)} TO ${to.toISOString().slice(0, 10)}]`;
}

function toPaper(r: Result, license: RawPaper["license"], raw: string): RawPaper {
  return {
    source: "europepmc",
    external_id: `${r.source}:${r.id}`,
    doi: r.doi ?? null,
    title: r.title.replace(/\s+/g, " ").trim(),
    abstract: r.abstractText?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
    authors: (r.authorString ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean),
    published_date: r.firstPublicationDate ?? null,
    license,
    license_raw: raw,
    landing_url: `https://europepmc.org/article/${r.source}/${r.id}`,
    // PPR 은 프리프린트 서버 수록분이다.
    version: r.source === "PPR" ? "preprint" : "published",
    raw_data: { journal: r.journalInfo?.journal?.title ?? null },
  };
}

async function search(query: string, pageSize: number): Promise<Result[]> {
  const url =
    `${REST}?query=${encodeURIComponent(query)}` +
    `&format=json&resultType=core&pageSize=${pageSize}`;
  const data = await fetchJson<Response>(url, { timeoutMs: 30_000 });
  return data.resultList?.result ?? [];
}

export async function collectEuropePmc(
  days = 7,
): Promise<{ papers: RawPaper[]; report: CollectReport }> {
  const papers: RawPaper[] = [];
  const errors: string[] = [];
  let found = 0;
  let rejected = 0;
  const seen = new Set<string>();

  const range = dateRange(days);

  const queries = [
    `(OPEN_ACCESS:y) AND (FIRST_PDATE:${range}) AND (LICENSE:"cc by" OR LICENSE:"cc0")`,
    ...PUBLIC_DOMAIN_JOURNALS.map(
      (j) => `(JOURNAL:"${j}") AND (FIRST_PDATE:${range})`,
    ),
  ];

  for (const query of queries) {
    try {
      const results = await search(query, 50);
      found += results.length;

      for (const r of results) {
        const key = `${r.source}:${r.id}`;
        if (seen.has(key)) continue;

        const journal = r.journalInfo?.journal?.title ?? "";
        const isPd = PUBLIC_DOMAIN_JOURNALS.some((j) => journal.includes(j));

        const license = isPd ? "public_domain" : normalizeLicense(r.license);
        if (!license) {
          rejected += 1;
          continue;
        }

        seen.add(key);
        papers.push(
          toPaper(
            r,
            license,
            isPd ? `US government work · ${journal}` : (r.license ?? ""),
          ),
        );
      }
    } catch (err) {
      errors.push(
        `${query.slice(0, 40)}…: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { papers, report: { source: "europepmc", found, rejected, errors } };
}
