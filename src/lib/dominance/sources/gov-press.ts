// 정부 보도자료 · 공공누리 제1유형 마크를 실제로 확인한 기관만.
//
// 2026-09-25 실사 기준으로 보건복지부와 과기정통부의 RSS 주소를 확인했다.
// 질병관리청은 마크 부착은 확인했지만 목록이 자바스크립트 함수 호출이어서
// 기사 주소 규칙을 아직 읽지 못했다. 그래서 여기에 넣지 않는다 —
// 확인하지 못한 것을 추측해서 넣으면 틀린 주소로 출처를 표시하게 된다.

import * as cheerio from "cheerio";
import { fetchText } from "./http";
import { koglAttribution } from "./license";
import type { Agency, CollectReport, RawGovPress } from "./types";

type Feed = {
  agency: Agency;
  label: string;
  url: string;
  /** 본문이 들어 있는 태그. 기관마다 다르다. 선택자이므로 콜론을 escape 한다. */
  bodyTag: "description" | "content\\:encoded";
  /** 링크에서 글 번호를 뽑는 이름. */
  idParam: string;
};

const FEEDS: Feed[] = [
  {
    agency: "mohw",
    label: "보건복지부",
    url: "https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027",
    // 순수 텍스트 1,126자 수준으로 품질이 가장 좋다.
    bodyTag: "description",
    idParam: "list_no",
  },
  {
    agency: "msit",
    label: "과학기술정보통신부",
    url: "https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94",
    bodyTag: "content\\:encoded",
    idParam: "nttSeqNo",
  },
];

const MAX_BODY_LENGTH = 6000;

/**
 * 과기정통부 본문에는 한글 문서에서 옮겨 온 주석 덩어리가 섞여 들어온다.
 * 그 덩어리가 실체 참조로 한 번 더 감싸여 오므로 먼저 풀고 나서 지운다.
 * 순서를 바꾸면 풀린 뒤에 주석이 되살아난다.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;|&rdquo;|&quot;|&#034;/g, '"')
    .replace(/&lsquo;|&rsquo;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanBody(raw: string): string | null {
  // 두 번 푸는 이유는 `&amp;nbsp;` 처럼 두 겹으로 인코딩된 문자가 섞여 오기 때문이다.
  const text = decodeEntities(decodeEntities(raw))
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text ? text.slice(0, MAX_BODY_LENGTH) : null;
}

/** 보건복지부는 RFC822, 과기정통부는 `2026.09.23` 을 준다. 둘 다 받는다. */
function toDate(raw: string): string | null {
  const s = raw.trim();
  const dotted = s.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function externalId(link: string, param: string): string | null {
  const match = link.match(new RegExp(`${param}=(\\d+)`));
  return match ? match[1] : null;
}

export async function collectGovPress(): Promise<{
  press: RawGovPress[];
  report: CollectReport;
}> {
  const press: RawGovPress[] = [];
  const errors: string[] = [];
  let found = 0;
  let rejected = 0;

  for (const feed of FEEDS) {
    try {
      const xml = await fetchText(feed.url, { accept: "application/rss+xml" });
      const $ = cheerio.load(xml, { xmlMode: true });

      const items = $("item").toArray();
      found += items.length;

      for (const el of items) {
        const item = $(el);
        const title = item.find("title").first().text().replace(/\s+/g, " ").trim();
        const link = item.find("link").first().text().trim();
        const id = externalId(link, feed.idParam);

        // 글 번호를 못 읽으면 같은 글이 매일 새 행으로 쌓인다. 그럴 땐 버린다.
        if (!title || !link || !id) {
          rejected += 1;
          continue;
        }

        press.push({
          agency: feed.agency,
          external_id: id,
          title,
          body: cleanBody(item.find(feed.bodyTag).first().text()),
          published_date: toDate(item.find("pubDate").first().text()),
          landing_url: link.replace(/&amp;/g, "&"),
          attribution: koglAttribution(feed.label, title),
        });
      }
    } catch (err) {
      errors.push(
        `${feed.agency}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { press, report: { source: "gov_press", found, rejected, errors } };
}
