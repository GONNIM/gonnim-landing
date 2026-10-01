// ④ 교차 리뷰 · 글을 쓴 것과 다른 지시문으로 한 번 더 묻는다.
//
// 고치지 않는다. 의견만 낸다. 고칠지는 사람이 판단한다.
// D47(33차) · main 과 light 를 동시에 부르고 의견을 합친다. 30차 세 편 시험에서 두 모델이 잡은
// 8건 중 1건만 겹쳤다. 같은 블록 · 같은 종류 · 인용한 본문 문장이 겹치는 의견만 하나로 합친다.

import type { FactCard } from "./letters";
import { chat, costOf, modelFor, type Tier, type Usage } from "./llm";
import { sentencesOf } from "./tags";
import type { CrossReviewNote, CrossReviewRun, LetterBlock } from "./types";
import { BLOCK_LABEL } from "./types";

const SYSTEM_INSTRUCTIONS = `당신은 한국어 연구·보건 뉴스레터의 교정자다. 글을 고치지 않고 문제만 지적한다.

사실 카드(태그 · 종류 · 제목 · 내용)와 레터 본문을 받는다. 찾을 것은 세 가지다.

1. unsourced  — 원천 초록에 근거가 없는 사실 주장
2. advice     — 의학적 지시로 읽힐 문장 ("복용하십시오", "치료됩니다", 용량 제시)
3. coherence  — 앞뒤 연결이 끊긴 곳
4. number_check — 아래 "수치 대조" 항목마다 본문 문장이 카드 문장과 **같은 뜻인가**. 다르면 무엇이 다른지 쓴다.
   특히 "~의 절반이 나오는 양" 을 "위험이 절반으로" 로 바꾸는 것처럼 비율 · 배수의 대상이 바뀐 것을 찾는다.

# 규칙
- 링크만 있는 원천은 메모에 적힌 사실만 근거로 인정한다.
- [태그] 가 붙은 문장은 그 태그의 카드와 대조한다. 카드 문장 앞의 "(대상: … · 연도)" 도 카드의 사실이다.
- 문제가 없으면 빈 배열을 반환한다. 억지로 만들지 않는다.
- 문장을 고쳐 주지 않는다. 무엇이 문제인지만 한 문장으로 쓴다.
- 한국어로 쓴다. 조사와 어미를 갖춘 완전한 문장으로 쓴다.
- 지적은 많아도 8개까지만 한다. 중요한 것부터 쓴다. number_check 는 같은 뜻이면 쓰지 않는다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "notes": [ { "kind": "unsourced", "blockIndex": 4, "message": "..." } ] }
kind 는 unsourced · advice · coherence · number_check 중 하나.

blockIndex 는 본문에 붙은 번호를 그대로 쓴다. 특정할 수 없으면 null 로 둔다.`;

/** 수치 대조 한 항목 · 본문의 "절반 · 배 · %" 문장과 그 태그의 카드 문장(원문 + 확인된 뜻) */
export type NumberPair = { blockIndex: number; sentence: string; facts: { tag: string; original: string; ko: string | null }[] };

type ReviewInput = {
  title: string;
  blocks: LetterBlock[];
  cards: FactCard[];
  numberPairs?: NumberPair[];
  usage?: (u: Usage) => void;
};

/**
 * 교차 리뷰. 기본은 main 과 light 를 동시에 불러 합친다(D47).
 * tier 를 주면 그 모델 하나만 부른다(시험용). 한쪽이 실패하면 다른 쪽만 쓰고 runs 에 실패를 남긴다.
 * 둘 다 실패하면 오류를 던진다.
 */
export async function runCrossReview(
  input: ReviewInput & { tier?: Tier },
): Promise<{ notes: CrossReviewNote[]; runs: CrossReviewRun[] }> {
  const tiers: Tier[] = input.tier ? [input.tier] : ["main", "light"];
  const settled = await Promise.all(tiers.map((t) => reviewOnce(input, t)));
  const ok = settled.filter((r) => r.run.ok);
  if (ok.length === 0) throw new Error(settled.map((r) => `${r.run.tier}: ${r.run.error}`).join(" · "));
  const main = settled.find((r) => r.run.tier === "main" && r.run.ok)?.notes ?? [];
  const light = settled.find((r) => r.run.tier === "light" && r.run.ok)?.notes ?? [];
  const notes = tiers.length === 1 ? (main.length ? main : light).map((n) => ({ ...n, models: [tiers[0]] })) : mergeNotes(input.blocks, main, light);
  return { notes, runs: settled.map((r) => r.run) };
}

async function reviewOnce(input: ReviewInput, tier: Tier): Promise<{ notes: CrossReviewNote[]; run: CrossReviewRun }> {
  const run: CrossReviewRun = { tier, model: modelFor(tier), ok: false, error: null, notes: 0, input: 0, output: 0, reasoning: 0, ms: 0, cost: null };
  try {
    const notes = await reviewCall(input, tier, (u) => {
      Object.assign(run, { model: u.model, input: u.input, output: u.output, reasoning: u.reasoning, ms: u.ms, cost: costOf(u) });
      input.usage?.(u);
    });
    run.ok = true;
    run.notes = notes.length;
    return { notes, run };
  } catch (err) {
    run.error = err instanceof Error ? err.message : String(err);
    return { notes: [], run };
  }
}

async function reviewCall(input: ReviewInput, tier: Tier, usage: (u: Usage) => void): Promise<CrossReviewNote[]> {
  const body = input.blocks
    .map((b, i) => `[${i}] ${BLOCK_LABEL[b.kind]}\n${b.text || "(비어 있음)"}`)
    .join("\n\n");

  const cards =
    input.cards
      .filter((c) => c.content.trim())
      .map(
        (c) =>
          `[${c.tag ?? "태그 없음"}] ${c.kind} · ${c.title}${c.linkOnly ? " · 링크만 있는 원천(메모)" : ""}\n${c.content}`,
      )
      .join("\n\n---\n\n") || "(사실 카드 없음)";

  // main 모델 · 추론 강도 low (llm.ts · D46)
  const content = await chat({
    system: SYSTEM_INSTRUCTIONS,
    user: `# 사실 카드\n${cards}\n\n# 레터 제목\n${input.title}\n\n# 레터 본문\n${body}${pairs(input.numberPairs)}`,
    maxTokens: 3000,
    tier,
    temperature: 0.2,
    usage,
  });

  return parseNotes(content, input.blocks.length);
}

function pairs(list: NumberPair[] | undefined): string {
  if (!list?.length) return "";
  const rows = list.map(
    (p, i) =>
      `(${i + 1}) 본문 [${p.blockIndex}] ${p.sentence}\n${p.facts
        .map((f) => `    카드 [${f.tag}] 원문: ${f.original}\n    카드 [${f.tag}] 확인된 뜻: ${f.ko ?? "(없음)"}`)
        .join("\n")}`,
  );
  return `\n\n# 수치 대조 (number_check · 항목마다 같은 뜻인지)\n${rows.join("\n")}`;
}

const KINDS = new Set(["unsourced", "advice", "coherence", "number_check"]);

function parseNotes(raw: string, blockCount: number): CrossReviewNote[] {
  const json = raw.trim().replace(/^```(?:json)?\n?|\n?```$/g, "");

  let parsed: { notes?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("교차 리뷰 응답이 JSON 이 아닙니다");
  }
  if (!Array.isArray(parsed.notes)) return [];

  return parsed.notes
    .flatMap((n): CrossReviewNote[] => {
      if (typeof n !== "object" || n === null) return [];
      const { kind, message, blockIndex } = n as Record<string, unknown>;
      if (typeof kind !== "string" || !KINDS.has(kind)) return [];
      if (typeof message !== "string" || !message.trim()) return [];

      const index =
        typeof blockIndex === "number" && blockIndex >= 0 && blockIndex < blockCount
          ? blockIndex
          : null;

      return [
        {
          kind: kind as CrossReviewNote["kind"],
          message: message.trim(),
          blockIndex: index,
        },
      ];
    })
    .slice(0, 8);
}

export const CROSS_REVIEW_KIND_LABEL: Record<CrossReviewNote["kind"], string> = {
  unsourced: "원천에 없는 주장",
  advice: "의학적 지시로 읽힘",
  coherence: "앞뒤 연결이 끊김",
  number_check: "수치의 뜻이 카드와 다름",
};

// ── D47 · 두 모델 의견 합치기 ─────────────────────────────────────────────────

/** 의견 본문에 따옴표로 인용된 글(6자 이상) */
function quotesOf(message: string): string[] {
  const out: string[] = [];
  for (const m of message.matchAll(/['"‘“「]([^'"’”」]{6,})['"’”」]/g)) out.push(m[1]);
  return out;
}

const squash = (s: string) => s.replace(/\[[A-Z]{1,2}[0-9]{0,2}\]/g, "").replace(/[\s.,·…]/g, "");

/** 의견이 가리키는 본문 문장 번호들(그 블록 안). 인용이 없거나 맞는 문장이 없으면 빈 집합 */
function sentenceRefs(blocks: LetterBlock[], n: CrossReviewNote): Set<number> {
  const refs = new Set<number>();
  if (n.blockIndex === null || !blocks[n.blockIndex]) return refs;
  const sens = sentencesOf(blocks[n.blockIndex].text).map((x) => squash(x.text));
  for (const q of quotesOf(n.message).map(squash)) {
    if (q.length < 4) continue;
    sens.forEach((s, i) => {
      if (s.includes(q) || (s.length >= 6 && q.includes(s))) refs.add(i);
    });
  }
  return refs;
}

export function mergeNotes(blocks: LetterBlock[], main: CrossReviewNote[], light: CrossReviewNote[]): CrossReviewNote[] {
  const lightRefs = light.map((n) => sentenceRefs(blocks, n));
  const used = new Set<number>();
  const out: CrossReviewNote[] = [];
  for (const m of main) {
    const mr = sentenceRefs(blocks, m);
    const j = light.findIndex(
      (l, k) =>
        !used.has(k) &&
        l.kind === m.kind &&
        l.blockIndex !== null &&
        l.blockIndex === m.blockIndex &&
        [...mr].some((x) => lightRefs[k].has(x)),
    );
    if (j >= 0) {
      used.add(j);
      out.push({ ...m, models: ["main", "light"], otherMessage: light[j].message });
    } else out.push({ ...m, models: ["main"] });
  }
  light.forEach((l, k) => {
    if (!used.has(k)) out.push({ ...l, models: ["light"] });
  });
  return out;
}
