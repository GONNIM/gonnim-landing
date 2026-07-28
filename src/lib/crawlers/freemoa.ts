// Freemoa Crawler · Playwright (SPA · AJAX 동적 로딩 · SSL 인증서 이슈)
// Node runtime · Vercel Serverless 불가 (Wanted Gigs 와 동일 방식)
// 실행: scripts/crawl-freemoa.ts (로컬 or Docker)
//
// 페이지 구조 (2026-07-28 재조사):
//   List: https://www.freemoa.net/m4/s41
//   Detail: /gsp/view/1?idx=X (실 크롤 시 확인)
//   프로젝트 리스트 · JS AJAX 로 동적 로딩 · `.proj-list-item_new` 컨테이너

import { chromium, type Browser } from "playwright";
import type { Crawler, CrawlResult, RawProject } from "./base";
import type { ContractType } from "@/lib/supabase/types";

const LIST_URL = "https://www.freemoa.net/m4/s41";
const BASE = "https://www.freemoa.net";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type ScrapedItem = {
  external_id: string;
  external_url: string;
  title: string;
  budgetText: string;
  formText: string;      // 프로젝트 형태 (도급/상주 등)
  categoryText: string;   // 개발 분야
  durationText: string;
  deadlineText: string;
  registeredText: string;
};

export class FreemoaCrawler implements Crawler {
  channel = "freemoa" as const;

  async crawl(): Promise<CrawlResult> {
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];
    const projects: RawProject[] = [];

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1440, height: 900 },
        locale: "ko-KR",
        ignoreHTTPSErrors: true, // Freemoa SSL 인증서 이슈 우회
      });
      const page = await context.newPage();

      await page.goto(LIST_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });

      // AJAX 렌더 대기 · 프로젝트 리스트 li 등장 or 5초
      await page
        .waitForSelector("ul#projectListNew > li", { timeout: 20_000 })
        .catch(() => null);
      await page.waitForTimeout(3000);

      // 진단: 0 items 시 스크린샷
      const itemCount = await page
        .locator("ul#projectListNew > li")
        .count()
        .catch(() => 0);
      if (itemCount === 0) {
        const title = await page.title().catch(() => "");
        errors.push(`no items · title="${title.slice(0, 80)}"`);
        await page
          .screenshot({ path: "/tmp/freemoa-empty.png", fullPage: false })
          .catch(() => null);
      }

      // Page 컨텍스트에서 항목 수집 (pure JS · 텍스트+클래스 hybrid)
      const items = (await page.evaluate(() => {
        const out: unknown[] = [];
        const list = document.querySelectorAll("ul#projectListNew > li");
        for (const li of Array.from(list)) {
          // 프로젝트 id = data-pno · li 하위 div 에 있음
          const dataPnoEl = li.querySelector("[data-pno]");
          const pno = dataPnoEl?.getAttribute("data-pno") || "";
          if (!pno) continue;

          // 제목 · .title (projTitle 내부)
          const titleEl = li.querySelector(".title");
          const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
          if (!title) continue;

          // 등록일 · .date
          const dateEl = li.querySelector(".date");
          const registeredText = (dateEl?.textContent || "").trim();

          // 나머지 · fullText 정형 파싱
          const fullText = (li.textContent || "").replace(/\s+/g, " ").trim();

          // 예상비용 · "예상비용 500 ~ 1,000 만원"
          const budgetMatch = fullText.match(/예상비용\s*([\d,~\s만원원.]+?)(?:\s*예상기간|\s*지원자수|\s*마감일정|$)/);
          const budgetText = budgetMatch ? budgetMatch[1].trim() : "";

          // 예상기간
          const durMatch = fullText.match(/예상기간\s*(\d+\s*(?:개월|주|일))/);
          const durationText = durMatch ? durMatch[1].replace(/\s+/g, "") : "";

          // 마감일정 · "D-13" or "2026.08.10"
          const dlMatch = fullText.match(/마감일정\s*(D-\s*\d+|\d{4}[.\-]\d{2}[.\-]\d{2})/);
          const deadlineText = dlMatch ? dlMatch[1].replace(/\s+/g, "") : "";

          // 지원자수
          const applyMatch = fullText.match(/지원자수\s*(\d+)/);
          const applyCount = applyMatch ? Number(applyMatch[1]) : 0;

          // 프로젝트 형태 · title 이후 (모집중/마감 전) 첫 한글 · inline (no helper fn)
          const escTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const formMatch = fullText.match(new RegExp(escTitle + "\\s+([가-힣]+?)(?:모집중|마감|D-)"));
          const formText = formMatch ? formMatch[1].trim() : "";

          // 카테고리 · 상태 다음 · "예상비용" 전
          const catMatch = fullText.match(/(?:모집중|마감|D-\d+)\s+([가-힣,\s\w]+?)\s+예상비용/);
          const categoryText = catMatch ? catMatch[1].trim().replace(/\s+/g, " ") : "";

          out.push({
            external_id: String(pno),
            external_url: `https://www.freemoa.net/gsp/view/1?idx=${pno}`,
            title,
            budgetText,
            formText,
            categoryText,
            durationText,
            deadlineText,
            registeredText,
            applyCount,
          });
        }
        return out;
      })) as (ScrapedItem & { applyCount: number })[];

      for (const it of items) {
        try {
          const { min, max } = parseBudget(it.budgetText);
          const duration = parseDurationDays(it.durationText);
          const posted = parseRelativeDate(it.registeredText);
          const deadline = parseRelativeDate(it.deadlineText);
          const contract = mapContractType(it.formText);
          const work =
            contract === "outsourcing"
              ? "remote"
              : contract === "contractor"
                ? "onsite"
                : null;

          projects.push({
            external_id: it.external_id,
            external_url: it.external_url,
            title: it.title,
            description: it.categoryText || null,
            category: it.categoryText || null,
            skills: [],
            budget_min: min,
            budget_max: max,
            budget_currency: "KRW",
            duration_days: duration,
            work_type: work,
            contract_type: contract,
            location: null,
            applicants_count: it.applyCount ?? 0,
            posted_at: posted,
            deadline_at: deadline,
            raw_data: {
              budgetText: it.budgetText,
              formText: it.formText,
              categoryText: it.categoryText,
              durationText: it.durationText,
              deadlineText: it.deadlineText,
              registeredText: it.registeredText,
              scrapedAt: fetchedAt,
            },
          });
        } catch (err) {
          errors.push(
            `parse-error id=${it.external_id} · ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `fetch-error · ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    return { channel: this.channel, projects, errors, fetchedAt };
  }
}

// ---------- helpers ----------

function parseBudget(text: string): { min: number | null; max: number | null } {
  // Examples:
  //   "300 만원 ~ 500 만원"
  //   "1,000 만원"
  //   "협의"
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.includes("협의")) return { min: null, max: null };
  const nums = Array.from(cleaned.matchAll(/([\d,]+)\s*(만원|원)/g)).map((m) => {
    const v = Number(m[1].replace(/,/g, ""));
    return m[2] === "만원" ? v * 10_000 : v;
  });
  if (nums.length === 0) return { min: null, max: null };
  return {
    min: Math.min(...nums),
    max: nums.length > 1 ? Math.max(...nums) : Math.min(...nums),
  };
}

function parseDurationDays(text: string): number | null {
  if (!text) return null;
  const months = text.match(/(\d+)\s*개월/);
  if (months) return Number(months[1]) * 30;
  const weeks = text.match(/(\d+)\s*주/);
  if (weeks) return Number(weeks[1]) * 7;
  const days = text.match(/(\d+)\s*일/);
  if (days) return Number(days[1]);
  return null;
}

function parseRelativeDate(text: string): string | null {
  // Examples: "2026-07-28" · "2026.07.28" · "07-28"
  const iso = text.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`;
  const short = text.match(/(\d{2})[.\-](\d{2})\s*$/);
  if (short) {
    const y = new Date().getFullYear();
    return `${y}-${short[1]}-${short[2]}T00:00:00Z`;
  }
  return null;
}

function mapContractType(formText: string): ContractType | null {
  const t = formText.replace(/\s+/g, "");
  if (t.includes("도급") || t.includes("원격") || t.includes("STANDARD") || t.includes("PRO"))
    return "outsourcing";
  if (t.includes("상주")) return "contractor";
  if (t.includes("파트") || t.includes("part")) return "part-time";
  return null;
}
