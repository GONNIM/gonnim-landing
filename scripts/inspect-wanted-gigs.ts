// Inspect Wanted Gigs project cards.
// Run: npx tsx scripts/inspect-wanted-gigs.ts

import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  await page.goto("https://www.wanted.co.kr/gigs/projects", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  // Wait for at least one project detail anchor to appear
  await page
    .waitForSelector("a[href^='/gigs/projects/']", { timeout: 20_000 })
    .catch(() => null);
  await page.waitForTimeout(3000);

  // Filter to project detail links only (numeric id · not "/add")
  const anchors = await page
    .locator("a[href*='/gigs/projects/']")
    .evaluateAll((els) =>
      els
        .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
        .filter((h) => /^\/gigs\/projects\/\d+/.test(h)),
    );

  console.log(`project detail anchors: ${anchors.length}`);
  console.log(`sample:`, anchors.slice(0, 5));

  // Take first real project card (not "advertising" ones ideally)
  const firstOrganic = anchors.find((h) => !h.includes("advertisingId"));
  console.log(`\nfirst organic anchor: ${firstOrganic}`);

  // Grab outer HTML of the card container (walk up several levels)
  if (firstOrganic) {
    const html = await page.evaluate((href) => {
      const a = document.querySelector(`a[href="${href}"]`);
      if (!a) return "";
      // Walk up until we find the widest container that only holds project fields
      let cur: Element | null = a.parentElement;
      let last = a;
      while (cur && cur.tagName !== "BODY") {
        // Stop when the outer text length grows dramatically (i.e., includes multiple projects)
        const links = cur.querySelectorAll("a[href^='/gigs/projects/']").length;
        if (links > 1) break;
        last = cur;
        cur = cur.parentElement;
      }
      return last.outerHTML;
    }, firstOrganic);
    console.log("--- card outerHTML (3500 chars) ---");
    console.log(html.slice(0, 3500));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
