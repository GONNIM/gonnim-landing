// Standalone crawler test · run with: npx tsx scripts/test-wishket-crawler.ts
// Does NOT touch Supabase — just verifies fetch + parse.

import { WishketCrawler } from "../src/lib/crawlers/wishket";
import { calculateRelevance } from "../src/lib/relevance";

async function main() {
  const c = new WishketCrawler();
  const r = await c.crawl();

  console.log(`\n===== Wishket Crawl Result =====`);
  console.log(`fetchedAt: ${r.fetchedAt}`);
  console.log(`projects:  ${r.projects.length}`);
  console.log(`errors:    ${r.errors.length}`);

  if (r.errors.length) {
    console.log(`\n----- errors -----`);
    for (const e of r.errors.slice(0, 5)) console.log(`  ${e}`);
  }

  const top = r.projects.slice(0, 5);
  for (const p of top) {
    const { score, breakdown } = calculateRelevance({
      title: p.title,
      description: p.description ?? null,
      category: p.category ?? null,
      skills: p.skills ?? null,
      budget_min: p.budget_min ?? null,
      duration_days: p.duration_days ?? null,
      work_type: p.work_type ?? null,
      contract_type: p.contract_type ?? null,
      applicants_count: p.applicants_count ?? 0,
    });

    console.log(`\n----- [${p.external_id}] ${p.title}`);
    console.log(`  URL:      ${p.external_url}`);
    console.log(`  Category: ${p.category ?? "-"}`);
    console.log(`  Contract: ${p.contract_type ?? "-"} · Work: ${p.work_type ?? "-"}`);
    console.log(
      `  Budget:   ${p.budget_min?.toLocaleString() ?? "-"} ~ ${p.budget_max?.toLocaleString() ?? "-"} ${p.budget_currency ?? ""}`,
    );
    console.log(`  Duration: ${p.duration_days ?? "-"}일`);
    console.log(`  Applicants: ${p.applicants_count ?? 0}`);
    console.log(`  Location: ${p.location ?? "-"}`);
    console.log(`  Skills:   ${(p.skills ?? []).slice(0, 5).join(", ")}`);
    console.log(`  ★ Relevance ${score}/10 · ${JSON.stringify(breakdown)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
