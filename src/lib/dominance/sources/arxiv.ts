// arXiv 메타데이터 · CC0 1.0.
//
// 메타데이터만 쓴다. 본문 PDF 를 우리 서버에 두지 않고 항상 링크로 보낸다(약관).
// 요청은 arxivRequest 큐를 통해서만 나간다 — 3초당 1회, 단일 커넥션.

import * as cheerio from "cheerio";
import { arxivRequest, fetchText } from "./http";
import type { CollectReport, RawPaper } from "./types";

const API = "https://export.arxiv.org/api/query";

// 사람 몸과 과학기술 전반. 흥미 축은 점수 단계에서 재고, 여기서는 범위만 좁힌다.
const CATEGORIES = [
  "q-bio.NC", // 신경과학
  "q-bio.CB", // 세포행동
  "q-bio.GN", // 유전체
  "q-bio.TO", // 조직·기관
  "physics.med-ph", // 의학물리
];

type Entry = {
  id: string;
  title: string;
  summary: string;
  published: string;
  authors: string[];
  doi: string | null;
};

function parseAtom(xml: string): Entry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("entry")
    .toArray()
    .map((el) => {
      const e = $(el);
      const doi = e.find("arxiv\\:doi").text().trim();
      return {
        id: e.find("id").first().text().trim(),
        title: e.find("title").first().text().replace(/\s+/g, " ").trim(),
        summary: e.find("summary").first().text().replace(/\s+/g, " ").trim(),
        published: e.find("published").first().text().trim(),
        authors: e
          .find("author > name")
          .toArray()
          .map((a) => $(a).text().trim())
          .filter(Boolean),
        doi: doi || null,
      };
    })
    .filter((e) => e.id && e.title);
}

/** abs URL 에서 판본 번호를 뗀 식별자. 같은 논문의 v2 를 새 행으로 만들지 않는다. */
function externalId(absUrl: string): string {
  const tail = absUrl.split("/abs/")[1] ?? absUrl;
  return tail.replace(/v\d+$/, "");
}

export async function collectArxiv(
  perCategory = 20,
): Promise<{ papers: RawPaper[]; report: CollectReport }> {
  const papers: RawPaper[] = [];
  const errors: string[] = [];
  let found = 0;

  for (const category of CATEGORIES) {
    const url =
      `${API}?search_query=cat:${encodeURIComponent(category)}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${perCategory}`;

    try {
      const xml = await arxivRequest(() =>
        fetchText(url, { accept: "application/atom+xml" }),
      );
      const entries = parseAtom(xml);
      found += entries.length;

      for (const e of entries) {
        papers.push({
          source: "arxiv",
          external_id: externalId(e.id),
          doi: e.doi,
          title: e.title,
          abstract: e.summary || null,
          authors: e.authors,
          published_date: e.published ? e.published.slice(0, 10) : null,
          // arXiv 메타데이터 전체가 CC0 이다. 논문별 라이선스를 볼 필요가 없다.
          license: "cc0",
          license_raw: "arXiv metadata CC0 1.0",
          landing_url: e.id.replace("http://", "https://"),
          version: "preprint",
          raw_data: { category },
        });
      }
    } catch (err) {
      errors.push(
        `${category}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    papers,
    report: { source: "arxiv", found, rejected: 0, errors },
  };
}
