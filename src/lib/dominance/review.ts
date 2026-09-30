// ④ 완성 글 리뷰 · 자동 점검 7항목.
//
// 앞의 4개(filters·blocks·sources·links)는 통과를 막는다. 사실 관계나 저작권에 걸리는 항목이다.
// 뒤의 3개(hook·paradox·sentence_length)는 경고만 한다. 글의 됨됨이는 기계 판단이 틀릴 수 있다.

import { FACTUAL_KINDS, countFlags, flagBlocks, hookIsQuestion } from "./filters";
import { countNumbers } from "./numbers";
import { sentencesOf } from "./tags";
import { unknownTags } from "./render";
import {
  BLOCK_ORDER,
  BLOCK_LABEL,
  BLOCKING_REVIEW_CHECKS,
  type LetterBlock,
  type ReviewCheck,
  type ReviewCheckCode,
} from "./types";


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

// 원천 태그 [E1] 는 독자가 읽는 글자가 아니다(발행본에서는 위첨자 번호). 길이에서 뺀다.
const SOURCE_TAG = /\[[A-Z]{1,2}[0-9]{0,2}\]/g;

export function longSentences(blocks: LetterBlock[]): string[] {
  return blocks
    .flatMap((b) => b.text.split(/(?<=[.!?。])\s+|\n+/))
    .map((s) => s.trim())
    .filter((s) => s.replace(SOURCE_TAG, "").length > MAX_SENTENCE_LENGTH);
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

/**
 * 링크 점검 대상. 지배상식 자체 집계(own)는 뺀다 — 우리 검색 페이지 주소라서
 * 원천의 존재를 확인하는 대상이 아니고, 늘 "확인 불가" 경고만 남긴다. 원천 목록에는 그대로 나온다.
 */
export function linkCheckUrls(sources: { url: string; extKind?: string | null }[]): string[] {
  return sources.filter((s) => s.extKind !== "own").map((s) => s.url);
}

/** 경보 메일용. 확인 불가는 죽은 것으로 보지 않는다. */
export async function isLinkAlive(url: string): Promise<boolean> {
  return (await checkLink(url)) !== "dead";
}

export async function runReviewChecks(input: {
  blocks: LetterBlock[];
  sourceUrls: string[];
  /** 원천 목록의 태그. 주면 본문 태그 중 짝이 없는 것을 sources 점검에서 막는다 (D36). */
  sourceTags?: (string | null)[];
  /** 맨 위 한 문장 요약(ds_letters.summary). 이 태그도 원천 목록과 대조한다. */
  summary?: string | null;
  /** 사실 카드의 원천 언어 문장(20차 B-5). 주면 40자 복제를 찾는다. 옛 글은 비운다. */
  cardSentences?: string[];
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
  // 원천 목록에 없는 태그는 발행 틀이 번호로 바꾸지 못하고 [E9] 처럼 본문에 남는다.
  const orphanTags = input.sourceTags
    ? unknownTags([{ text: input.summary ?? "" }, ...blocks], input.sourceTags)
    : [];
  const sourceNotes = [
    unsourced.length > 0
      ? `출처 없는 블록: ${unsourced.map((b) => BLOCK_LABEL[b.kind]).join(", ")}`
      : "",
    orphanTags.length > 0
      ? `카드 · 원천 목록에 없는 태그 ${orphanTags.length}개: ${orphanTags.map((t) => `[${t}]`).join(" ")}`
      : "",
  ].filter(Boolean);
  checks.push({
    code: "sources",
    passed: sourceNotes.length === 0,
    detail: sourceNotes.length === 0 ? null : sourceNotes.join(" / "),
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

  // 8. 카드 문장 40자 이상 그대로 복제 (경고) · 한국어로 옮긴 글이라 실제로는 영어 원문 복제나 고유명사 나열이 걸린다
  const copies = findCopies(blocks, input.cardSentences ?? []);
  checks.push({
    code: "copy40",
    passed: true,
    warning: copies.length > 0 || undefined,
    detail:
      copies.length === 0
        ? input.cardSentences?.length
          ? null
          : "사실 카드가 없는 글이라 확인하지 않았습니다"
        : `${copies.length}곳: ${copies.map((c) => `"${c}"`).join(" / ")}`,
  });

  // 9. 인과 · 대조 접속어 (경고) · 원천에 없는 인과를 만들지 않았는지 사람이 본다
  const conn = connectiveSentences(blocks);
  checks.push({
    code: "connectives",
    passed: true,
    warning: conn.length > 0 || undefined,
    detail:
      conn.length === 0
        ? null
        : `${conn.length}문장 · 카드에 그 관계가 적혀 있는지 확인: ${conn.map((c) => `"${c}"`).join(" / ")}`,
  });

  // 10. 블록당 수치 (경고 · 22차 C-1) · 4개 이상이면 블록 이름과 개수
  const heavy = blocks
    .filter((b) => b.kind !== "summary")
    .map((b) => ({ kind: b.kind, n: countNumbers(b.text) }))
    .filter((x) => x.n >= 4);
  checks.push({
    code: "numbers",
    passed: true,
    warning: heavy.length > 0 || undefined,
    detail: heavy.length === 0 ? null : heavy.map((x) => `${BLOCK_LABEL[x.kind]} ${x.n}개`).join(" · "),
  });

  // 11. 태그 없는 문장의 숫자 (경고 · 23차 B-1) · 잇는 문장에 사실이 새는 것을 잡는다(연도는 세지 않음)
  const leaks = blocks.flatMap((b) =>
    sentencesOf(b.text)
      .map((x) => x.text)
      .filter((t) => !/\[[A-Z]{1,2}[0-9]{0,2}\]/.test(t) && countNumbers(t) > 0),
  );
  checks.push({
    code: "untagged_numbers",
    passed: true,
    warning: leaks.length > 0 || undefined,
    detail: leaks.length === 0 ? null : `${leaks.length}문장: ${leaks.map((t) => `"${t}"`).join(" / ")}`,
  });

  return checks;
}

export const COPY_MIN = 40;

/** 카드 문장과 40자 이상 같은 글자열. 태그는 빼고 본다. */
export function findCopies(blocks: LetterBlock[], cardSentences: string[]): string[] {
  const text = blocks.map((b) => b.text.replace(SOURCE_TAG, "")).join("\n");
  const hits = new Set<string>();
  for (const s of cardSentences) {
    for (let i = 0; i + COPY_MIN <= s.length; i++) {
      const piece = s.slice(i, i + COPY_MIN);
      if (text.includes(piece)) {
        // 가능한 만큼 늘려서 한 곳으로 보고한다.
        let end = i + COPY_MIN;
        while (end < s.length && text.includes(s.slice(i, end + 1))) end++;
        hits.add(s.slice(i, end));
        i = end;
      }
    }
  }
  return [...hits];
}

export const CONNECTIVES = ["때문", "그래서", "따라서", "그럼에도", "그런데도"];

/** 인과 · 대조 접속어가 든 문장. 태그는 빼고 인용한다. */
export function connectiveSentences(blocks: LetterBlock[]): string[] {
  return blocks
    .flatMap((b) => b.text.split(/(?<=[.!?。])\s+|\n+/))
    .map((s) => s.trim())
    .filter((s) => CONNECTIVES.some((c) => s.includes(c)))
    .map((s) => s.replace(SOURCE_TAG, "").trim());
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
