// 지배상식 스키마 실행 결과 확인 · 일회성 점검 스크립트
// 실행: node --env-file=.env.local scripts/verify-dominance-schema.mjs
import { createClient } from "@supabase/supabase-js";

// 지배상식은 별도 프로젝트 sprint-dominance 에 산다 (D22).
const url = process.env.DS_SUPABASE_URL;
const key = process.env.DS_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    `환경변수 없음 · DS_SUPABASE_URL=${url ? "있음" : "없음"} · DS_SUPABASE_SERVICE_ROLE_KEY=${key ? "있음" : "없음"}`,
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "ds_papers",
  "ds_gov_press",
  "ds_candidates",
  "ds_letters",
  "ds_letter_sources",
  "ds_letter_audit",
  "ds_subscribers",
  "ds_corrections",
];

console.log(`프로젝트 ${new URL(url).hostname.split(".")[0]}\n`);
console.log("표 8개");
let ok = 0;
for (const t of TABLES) {
  // head:true 는 오류를 삼키는 경우가 있어 실제 행을 읽는다.
  const { data, error } = await db.from(t).select("*").limit(1);
  if (error) console.log(`  ✖ ${t.padEnd(18)} ${error.code} · ${error.message}`);
  else {
    ok += 1;
    console.log(`  ✔ ${t.padEnd(18)} ${data.length}행 읽음`);
  }
}
console.log(`  → ${ok}/8\n`);

// 리뷰 단계 컬럼과 검색 컬럼이 실제로 붙었는지
console.log("ds_letters 새 컬럼");
for (const col of [
  "reviewed_at",
  "review_checks",
  "revision_count",
  "sent_count",
  "open_rate",
  "stats_synced_at",
  "search_text",
]) {
  const { error } = await db.from("ds_letters").select(col).limit(1);
  console.log(`  ${error ? "✖" : "✔"} ${col}${error ? ` · ${error.message}` : ""}`);
}

// 공개 버킷
const { data: buckets, error: bErr } = await db.storage.listBuckets();
const bucket = buckets?.find((b) => b.id === "ds-letters");
console.log(
  `\n버킷 ds-letters  ${bErr ? `✖ ${bErr.message}` : bucket ? `✔ public=${bucket.public}` : "✖ 없음"}`,
);

// 제약조건이 실제로 막는지 — 넷 다 실패해야 정상
console.log("\n제약조건 (넷 다 거부되어야 정상)");
const CASES = [
  [
    "라이선스 허용 목록",
    () =>
      db.from("ds_papers").insert({
        source: "medrxiv",
        external_id: "__probe",
        title: "probe",
        license: "cc_by_nc",
        license_raw: "cc-by-nc",
        landing_url: "https://example.invalid",
      }),
  ],
  [
    "발행 시각 · 상태",
    () =>
      db.from("ds_letters").insert({
        slug: "__probe1",
        title: "probe",
        status: "draft",
        published_at: new Date().toISOString(),
      }),
  ],
  [
    "승인 게이트",
    () =>
      db.from("ds_letters").insert({
        slug: "__probe2",
        title: "probe",
        status: "published",
        scheduled_for: "2026-09-25",
      }),
  ],
  [
    "리뷰 게이트",
    () =>
      db.from("ds_letters").insert({
        slug: "__probe3",
        title: "probe",
        status: "approved",
        scheduled_for: "2026-09-25",
        approved_at: new Date().toISOString(),
      }),
  ],
];

for (const [label, run] of CASES) {
  const { error } = await run();
  console.log(
    `  ${error ? "✔ 거부" : "✖ 통과됨 — 제약 없음"}  ${label}${error ? ` · ${error.code}` : ""}`,
  );
}

// 혹시 통과된 것이 있으면 흔적을 지운다
await db.from("ds_papers").delete().eq("external_id", "__probe");
await db.from("ds_letters").delete().like("slug", "__probe%");
