// ④ 완성 글 리뷰 · 자동 점검 7항목.
//
// 앞의 4개(filters·blocks·sources·links)는 통과를 막는다. 사실 관계나 저작권에 걸리는 항목이다.
// 뒤의 3개(hook·paradox·sentence_length)는 경고만 한다. 글의 됨됨이는 기계 판단이 틀릴 수 있다.

import { countFlags, flagBlocks, hookIsQuestion } from "./filters";
import {
  BLOCK_ORDER,
  BLOCK_LABEL,
  BLOCKING_REVIEW_CHECKS,
  type LetterBlock,
  type ReviewCheck,
  type ReviewCheckCode,
} from "./types";

const FACTUAL_KINDS = new Set(["summary", "research", "mechanism", "industry"]);

/** 통설을 세우고 깨는 문장에 거의 항상 나타나는 접속 표현. */
const PARADOX_MARKERS = [
  "그런데",
  "하지만",
  "그러나",
  "반대로",
  "오히려",
  "예외",
  "뒤집",
];

const MAX_SENTENCE_LENGTH = 60;

export function longSentences(blocks: LetterBlock[]): string[] {
  return blocks
    .flatMap((b) => b.text.split(/(?<=[.!?。])\s+|\n+/))
    .map((s) => s.trim())
    .filter((s) => s.length > MAX_SENTENCE_LENGTH);
}

/**
 * 링크 상태 셋 (D35).
 * - alive        열린다
 * - dead         404 · 410 · 연결 실패 · 시간 초과. 막는다
 * - unverifiable 403 · 429 등 서버가 자동 요청을 거절했다. 막지 않고 사람이 직접 눌러 본다
 */
export type LinkStatus = "alive" | "dead" | "unverifiable";

const EUROPE_PMC_PAGE = /^https?:\/\/(?:www\.)?europepmc\.org\/(?:article|abstract)\/([A-Z]+)\/([A-Za-z0-9]+)/;
const EUROPE_PMC_REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

// europepmc.org 는 자동 요청에 403 을 준다(2026-09-28 실측, curl·Node·브라우저 UA 모두).
// 그래서 웹 페이지 대신 약관이 허락한 REST 로 그 논문이 있는지 묻는다.
async function checkEuropePmc(source: string, id: string): Promise<LinkStatus> {
  // PMC 번호는 EXT_ID 로 찾히지 않는다(2026-09-28 실측, 99건 중 94건이 0건으로 나왔다). PMCID 필드로 묻는다.
  const query = source === "PMC" ? `PMCID:${id}` : `EXT_ID:${id} AND SRC:${source}`;
  try {
    const res = await fetch(
      `${EUROPE_PMC_REST}?${new URLSearchParams({ query, format: "json", resultType: "idlist", pageSize: "1" })}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return "unverifiable";
    const data = (await res.json()) as { hitCount?: number };
    return (data.hitCount ?? 0) > 0 ? "alive" : "dead";
  } catch {
    return "unverifiable";
  }
}

/** HEAD 로 먼저 물어보고, 열리지 않으면 GET 으로 한 번 더. 일부 학술 서버가 HEAD 를 막는다. */
export async function checkLink(url: string): Promise<LinkStatus> {
  const epmc = url.match(EUROPE_PMC_PAGE);
  if (epmc) return checkEuropePmc(epmc[1], epmc[2]);

  let status: number | null = null;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return "alive";
      status = res.status;
    } catch {
      // 다음 방법으로 넘어간다. GET 까지 실패하면 status 는 마지막 응답값이다.
    }
  }

  if (status === null) return "dead"; // 연결 실패 · 시간 초과
  if (status === 404 || status === 410) return "dead";
  return "unverifiable";
}

/** 경보 메일용. 확인 불가는 죽은 것으로 보지 않는다. */
export async function isLinkAlive(url: string): Promise<boolean> {
  return (await checkLink(url)) !== "dead";
}

export async function runReviewChecks(input: {
  blocks: LetterBlock[];
  sourceUrls: string[];
}): Promise<ReviewCheck[]> {
  const blocks = flagBlocks(input.blocks);
  const checks: ReviewCheck[] = [];

  // 1. 거절 필터
  const flagCount = countFlags(blocks);
  checks.push({
    code: "filters",
    passed: flagCount === 0,
    detail: flagCount === 0 ? null : `경고 ${flagCount}건이 남아 있습니다`,
  });

  // 2. 블록 구성
  const missing = BLOCK_ORDER.filter(
    (kind) => !blocks.some((b) => b.kind === kind && b.text.trim().length > 0),
  );
  checks.push({
    code: "blocks",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? null
        : `빈 블록: ${missing.map((k) => BLOCK_LABEL[k]).join(", ")}`,
  });

  // 3. 사실 블록의 출처
  const unsourced = blocks.filter(
    (b) =>
      FACTUAL_KINDS.has(b.kind) &&
      b.text.trim().length > 0 &&
      (b.sourceIds?.length ?? 0) === 0,
  );
  checks.push({
    code: "sources",
    passed: unsourced.length === 0,
    detail:
      unsourced.length === 0
        ? null
        : `출처 없는 블록: ${unsourced.map((b) => BLOCK_LABEL[b.kind]).join(", ")}`,
  });

  // 4. 원천 링크 생존 — 죽은 링크만 막는다. 확인 불가는 경고로 남긴다 (D35).
  const urls = [...new Set(input.sourceUrls)];
  const statuses = await Promise.all(urls.map(checkLink));
  const dead = urls.filter((_, i) => statuses[i] === "dead");
  const unverifiable = urls.filter((_, i) => statuses[i] === "unverifiable");
  const notes = [
    dead.length > 0 ? `열리지 않는 링크 ${dead.length}건: ${dead.join(", ")}` : "",
    unverifiable.length > 0
      ? `확인 불가 ${unverifiable.length}건 · 직접 눌러 확인: ${unverifiable.join(", ")}`
      : "",
  ].filter(Boolean);
  checks.push({
    code: "links",
    passed: urls.length > 0 && dead.length === 0,
    warning: unverifiable.length > 0 || undefined,
    detail:
      urls.length === 0
        ? "원천이 하나도 연결되지 않았습니다"
        : notes.length > 0
          ? notes.join(" / ")
          : null,
  });

  // 5. 훅 형태
  const hookOk = hookIsQuestion(blocks);
  checks.push({
    code: "hook",
    passed: hookOk,
    detail: hookOk ? null : "훅이 물음표로 끝나지 않습니다",
  });

  // 6. 역설 한 문장
  const text = blocks.map((b) => b.text).join(" ");
  const hasParadox = PARADOX_MARKERS.some((m) => text.includes(m));
  checks.push({
    code: "paradox",
    passed: hasParadox,
    detail: hasParadox ? null : "통설을 뒤집는 문장을 찾지 못했습니다",
  });

  // 7. 문장 길이
  const long = longSentences(blocks);
  checks.push({
    code: "sentence_length",
    passed: long.length === 0,
    detail:
      long.length === 0
        ? null
        : `${MAX_SENTENCE_LENGTH}자를 넘는 문장 ${long.length}개`,
  });

  return checks;
}

export function blockingFailures(checks: ReviewCheck[]): ReviewCheck[] {
  return checks.filter(
    (c) => !c.passed && BLOCKING_REVIEW_CHECKS.includes(c.code),
  );
}

export function isReviewPassable(checks: ReviewCheck[]): boolean {
  return blockingFailures(checks).length === 0;
}

export function isBlockingCheck(code: ReviewCheckCode): boolean {
  return BLOCKING_REVIEW_CHECKS.includes(code);
}
