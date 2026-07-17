// Wishket Crawler · fetch + cheerio · roster-based selectors.
// Source: verified 2026-07-13 · HTML DOM inspection.

import * as cheerio from "cheerio";
import type { Crawler, CrawlResult, RawProject } from "./base";
import type { ContractType } from "@/lib/supabase/types";

const WISHKET_BASE = "https://www.wishket.com";
const WISHKET_LIST_URL = `${WISHKET_BASE}/project/?ordering=-created`;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export class WishketCrawler implements Crawler {
  channel = "wishket" as const;

  async crawl(): Promise<CrawlResult> {
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];
    const projects: RawProject[] = [];

    try {
      const res = await fetch(WISHKET_LIST_URL, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
      });

      if (!res.ok) {
        errors.push(`HTTP ${res.status} · ${WISHKET_LIST_URL}`);
        return { channel: this.channel, projects, errors, fetchedAt };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Each project block: .project-info-box (organic list · not ads)
      $(".project-info-box").each((_, el) => {
        try {
          const box = $(el);

          // Skip ad blocks — organic listings contain `.project-organic-info`
          const organic = box.find(".project-organic-info").first();
          if (organic.length === 0) return;

          const link = organic.find("a.project-link").first();
          const href = link.attr("href") || "";
          const idMatch = href.match(/\/project\/(\d+)\//);
          if (!idMatch) return;

          const external_id = idMatch[1];
          const external_url = `${WISHKET_BASE}${href}`;

          const title =
            link.find("p.subtitle-1-half-medium").first().text().trim() ||
            organic.find(".subtitle-1-half-medium").first().text().trim();
          if (!title) return;

          const coreInfo = organic.find(".project-core-info").first();
          const budgetText = coreInfo.find(".budget").text();
          const termText = coreInfo.find(".term").text();
          const launchText = coreInfo.find(".launch-date").text();

          const parsedBudget = parseBudget(budgetText);
          const duration_days = parseDurationDays(termText);
          const posted_at = parseRelativeStartDate(launchText);

          const classification = organic
            .find(".project-classification-info")
            .first();
          const category =
            classification.find(".project-category-or-role").text().trim() ||
            null;
          const level =
            classification.find(".project-level").text().trim() || null;

          const minor = organic.find(".project-minor-info").first();
          const contractLabel = minor
            .find(".project-type-mark")
            .text()
            .trim();
          const contract_type = mapContractType(contractLabel);
          const work_type =
            contract_type === "outsourcing" ? "remote" : "onsite";

          const skills: string[] = [];
          minor.find(".skill-chip").each((__, chip) => {
            const raw = $(chip).text().trim();
            if (raw) skills.push(raw);
          });

          const location =
            minor.find(".location-data").text().trim().replace(/^\s+/, "") ||
            null;

          const registeredText = minor
            .find(".start-recruitment-data")
            .text()
            .trim();

          const proposalBox = box
            .find(".proposal-and-client-info")
            .first();
          const applicantsText = proposalBox
            .find(".info-detail")
            .eq(1)
            .text();
          const applicants_count = parseApplicants(applicantsText);
          const deadline_at = parseRelativeDeadline(
            proposalBox.find(".info-detail").eq(0).text(),
          );

          projects.push({
            external_id,
            external_url,
            title,
            description: level
              ? `${category ?? ""} · ${level}`.trim()
              : category,
            category,
            skills,
            budget_min: parsedBudget.min,
            budget_max: parsedBudget.max,
            budget_currency: "KRW",
            duration_days,
            work_type,
            contract_type,
            location,
            applicants_count,
            posted_at,
            deadline_at,
            raw_data: {
              budgetText: budgetText.replace(/\s+/g, " ").trim(),
              termText: termText.replace(/\s+/g, " ").trim(),
              launchText: launchText.replace(/\s+/g, " ").trim(),
              contractLabel,
              level,
              registeredText,
              scrapedAt: fetchedAt,
            },
          });
        } catch (err) {
          errors.push(
            `parse-error · ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
    } catch (err) {
      errors.push(
        `fetch-error · ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { channel: this.channel, projects, errors, fetchedAt };
  }
}

// ---------- helpers ----------

function parseBudget(text: string): { min: number | null; max: number | null } {
  // Examples:
  //   "월 금액 5,000,000원 /월"
  //   "예상 금액 1,000,000원"
  //   "월 금액 5,500,000원 /월"
  const cleaned = text.replace(/\s+/g, " ").trim();
  const nums = Array.from(cleaned.matchAll(/([\d,]+)원/g)).map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
  if (nums.length === 0) return { min: null, max: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: nums.length > 1 ? max : min };
}

function parseDurationDays(text: string): number | null {
  const m = text.match(/(\d+)\s*일/);
  return m ? Number(m[1]) : null;
}

function parseApplicants(text: string): number {
  const m = text.match(/(\d+)\s*명/);
  return m ? Number(m[1]) : 0;
}

function mapContractType(label: string): ContractType | null {
  const normalized = label.replace(/\s+/g, "");
  if (normalized.includes("외주") || normalized.includes("도급"))
    return "outsourcing";
  if (normalized.includes("기간제") || normalized.includes("상주"))
    return "contractor";
  return null;
}

function parseRelativeStartDate(text: string): string | null {
  // Look for absolute date like "2026.07.20."
  const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
}

function parseRelativeDeadline(text: string): string | null {
  // Format like "마감 2주 2일 전"
  const weeksMatch = text.match(/(\d+)\s*주/);
  const daysMatch = text.match(/(\d+)\s*일/);
  if (!weeksMatch && !daysMatch) return null;

  const days =
    (weeksMatch ? Number(weeksMatch[1]) * 7 : 0) +
    (daysMatch ? Number(daysMatch[1]) : 0);
  if (days <= 0) return null;

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);
  return deadline.toISOString();
}
