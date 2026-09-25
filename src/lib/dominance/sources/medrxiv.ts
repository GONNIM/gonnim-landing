// medRxiv · 논문 단위 license 필드를 읽어 허용 목록만 남긴다.
//
// 실측으로 100건 중 45건만 통과했다. 절반 넘게 버리는 것이 정상 동작이다.
// bioRxiv 는 같은 API 모양을 쓰지만 라이선스 분포를 아직 측정하지 못해 보류다.

import { fetchJson } from "./http";
import { normalizeLicense } from "./license";
import type { CollectReport, RawPaper } from "./types";

type Record = {
  doi: string;
  title: string;
  authors: string;
  date: string;
  version: string;
  license: string;
  category: string;
  abstract: string;
  published?: string;
};

type Response = {
  collection?: Record[];
  messages?: { status: string; total?: number }[];
};

function splitAuthors(raw: string): string[] {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function collectRxiv(
  server: "medrxiv" | "biorxiv",
  days: number,
): Promise<{ papers: RawPaper[]; report: CollectReport }> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const range = `${from.toISOString().slice(0, 10)}/${to.toISOString().slice(0, 10)}`;
  const url = `https://api.${server}.org/details/${server}/${range}/0/json`;

  const papers: RawPaper[] = [];
  const errors: string[] = [];
  let found = 0;
  let rejected = 0;

  try {
    const data = await fetchJson<Response>(url, { timeoutMs: 30_000 });
    const records = data.collection ?? [];
    found = records.length;

    // 같은 논문의 여러 판본이 오면 마지막(가장 큰 version)만 남긴다.
    const latest = new Map<string, Record>();
    for (const r of records) {
      const prev = latest.get(r.doi);
      if (!prev || Number(r.version) >= Number(prev.version)) latest.set(r.doi, r);
    }

    for (const r of latest.values()) {
      const license = normalizeLicense(r.license);
      if (!license) {
        rejected += 1;
        continue;
      }

      papers.push({
        source: server,
        external_id: r.doi,
        doi: r.doi,
        title: r.title.replace(/\s+/g, " ").trim(),
        abstract: r.abstract?.replace(/\s+/g, " ").trim() || null,
        authors: splitAuthors(r.authors),
        published_date: r.date || null,
        license,
        license_raw: r.license,
        landing_url: `https://www.${server}.org/content/${r.doi}v${r.version}`,
        // 프리프린트의 라이선스를 읽었으므로 판본도 프리프린트다.
        // 게재본은 라이선스가 다를 수 있어 같은 행으로 취급하지 않는다.
        version: "preprint",
        raw_data: { category: r.category, published: r.published ?? null },
      });
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { papers, report: { source: server, found, rejected, errors } };
}

export function collectMedrxiv(days = 3) {
  return collectRxiv("medrxiv", days);
}
