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

/** HEAD 로 먼저 물어보고 막히면 GET 으로 한 번 더. 일부 학술 서버가 HEAD 를 막는다. */
export async function isLinkAlive(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
    } catch {
      // 다음 방법으로 넘어간다
    }
  }
  return false;
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

  // 4. 원천 링크 생존
  const urls = [...new Set(input.sourceUrls)];
  const alive = await Promise.all(urls.map(isLinkAlive));
  const dead = urls.filter((_, i) => !alive[i]);
  checks.push({
    code: "links",
    passed: urls.length > 0 && dead.length === 0,
    detail:
      urls.length === 0
        ? "원천이 하나도 연결되지 않았습니다"
        : dead.length === 0
          ? null
          : `열리지 않는 링크 ${dead.length}건: ${dead.join(", ")}`,
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
