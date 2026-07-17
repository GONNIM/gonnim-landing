// Wanted Gigs crawler · Playwright (SPA · no public API).
// Node runtime only · cannot run inside Vercel Serverless (bundle > 250 MB).
// Invoke via `scripts/crawl-wanted-gigs.ts` locally or via Railway Docker.

import { chromium, type Browser } from "playwright";
import type { Crawler, CrawlResult, RawProject } from "./base";
import type { ContractType, WorkType } from "@/lib/supabase/types";

const LIST_URL = "https://www.wanted.co.kr/gigs/projects";
const BASE = "https://www.wanted.co.kr";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type ScrapedCard = {
  external_id: string;
  external_url: string;
  title: string;
  categoryGroup: string;
  categoryDetails: string[];
  workType: string | null; // "office" | "remote" | "hybrid" | ...
  status: string | null; // "모집중" 등
  budgetText: string;
  startDateText: string;
  durationText: string;
};

export class WantedGigsCrawler implements Crawler {
  channel = "wanted-gigs" as const;

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
      });
      const page = await context.newPage();

      await page.goto(LIST_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page
        .waitForSelector("a[data-attribute-id='gigs__project__detail']", {
          timeout: 20_000,
        })
        .catch(() => null);
      // Extra settling time for React hydration
      await page.waitForTimeout(2500);

      // Evaluate in page context — must be pure JS with no TS helpers
      const cards = (await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll(
            "a[data-attribute-id='gigs__project__detail']",
          ),
        );
        const seen = new Set();
        const out = [];
        for (const a of anchors) {
          const id = a.getAttribute("data-project-id") || "";
          if (!id || seen.has(id)) continue;
          seen.add(id);

          // Walk up to widest single-card container
          let cur = a.parentElement;
          let last = a;
          while (cur && cur.tagName !== "BODY") {
            const inside = cur.querySelectorAll(
              "a[data-attribute-id='gigs__project__detail']",
            ).length;
            if (inside > 1) break;
            last = cur;
            cur = cur.parentElement;
          }

          const href = a.getAttribute("href") || "";
          const url = href.startsWith("http")
            ? href
            : location.origin + href;

          const groupEl = last.querySelector(".category .group");
          const categoryGroup = (groupEl && groupEl.textContent
            ? groupEl.textContent
            : ""
          ).trim();

          const detailEls = Array.from(last.querySelectorAll(".category .detail"));
          const categoryDetails = detailEls.map((el) => {
            const t = (el.textContent || "").trim();
            return t.replace(/^#\s*/, "");
          });

          const etcEls = Array.from(last.querySelectorAll("ul.etc li"));
          const etcItems = etcEls.map((li) => (li.textContent || "").trim());

          const statusEl = last.querySelector(".project-icons span:last-child");
          const status = statusEl && statusEl.textContent
            ? statusEl.textContent.trim() || null
            : null;

          out.push({
            external_id: id,
            external_url: url,
            title: (a.textContent || "").trim(),
            categoryGroup,
            categoryDetails,
            workType: a.getAttribute("data-work-type"),
            status,
            budgetText: etcItems[0] || "",
            startDateText: etcItems[1] || "",
            durationText: etcItems[2] || "",
          });
        }
        return out;
      })) as ScrapedCard[];

      for (const c of cards) {
        try {
          const { min, max } = parseBudget(c.budgetText);
          const durationDays = parseDurationDays(c.durationText);
          const postedAt = parseStartDate(c.startDateText);
          const workType = mapWorkType(c.workType);
          const contractType = mapContractType(c.workType, c.title);

          projects.push({
            external_id: c.external_id,
            external_url: c.external_url.split("?")[0], // strip ad params
            title: c.title,
            description: c.categoryDetails.length
              ? `${c.categoryGroup} · ${c.categoryDetails.join(", ")}`.trim()
              : c.categoryGroup || null,
            category: c.categoryGroup || null,
            skills: c.categoryDetails,
            budget_min: min,
            budget_max: max,
            budget_currency: "KRW",
            duration_days: durationDays,
            work_type: workType,
            contract_type: contractType,
            location: null,
            applicants_count: 0,
            posted_at: postedAt,
            deadline_at: null,
            raw_data: {
              budgetText: c.budgetText,
              startDateText: c.startDateText,
              durationText: c.durationText,
              workType: c.workType,
              status: c.status,
              scrapedAt: fetchedAt,
            },
          });
        } catch (err) {
          errors.push(
            `parse-error id=${c.external_id} · ${err instanceof Error ? err.message : String(err)}`,
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
  //   "예상 금액 : 500만원  ~ 650만원 월 단위"
  //   "예상 금액 : 200만원 총액"
  //   "예상 금액 : 3,000,000원"
  const cleaned = text.replace(/\s+/g, " ").trim();
  const nums = Array.from(
    cleaned.matchAll(/([\d,]+)\s*(만원|원)/g),
  ).map((m) => {
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
  // Examples: "예상 기간 : 6개월", "예상 기간 : 45일", "예상 기간 : 3주"
  if (!text) return null;
  const months = text.match(/(\d+)\s*개월/);
  if (months) return Number(months[1]) * 30;
  const weeks = text.match(/(\d+)\s*주/);
  if (weeks) return Number(weeks[1]) * 7;
  const days = text.match(/(\d+)\s*일/);
  if (days) return Number(days[1]);
  return null;
}

function parseStartDate(text: string): string | null {
  // Example: "시작 예정일 : 2026-08-10"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
}

function mapWorkType(raw: string | null): WorkType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "office" || v === "onsite") return "onsite";
  if (v === "remote" || v === "home") return "remote";
  if (v === "hybrid" || v === "mixed") return "hybrid";
  return null;
}

function mapContractType(
  rawWorkType: string | null,
  title: string,
): ContractType | null {
  // Wanted Gigs data-work-type = office often correlates with 상주 contracts
  // But we also check title keywords.
  const t = title.toLowerCase();
  if (t.includes("[상주]") || t.includes("상주형")) return "contractor";
  if (t.includes("[원격]") || t.includes("재택")) return "outsourcing";
  if (rawWorkType === "office") return "contractor";
  if (rawWorkType === "remote") return "outsourcing";
  return null;
}
