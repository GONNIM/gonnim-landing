// ③ 편집자 호출 시험 (25차 D-3) · 기계 초안을 Fable 편집본처럼 고쳐 쓰게 한다. LLM 1회.
//
// 입력: 기계 초안 · 고른 문장의 카드(원문 · 뜻 · 대상 · 연도 · 태그) · 예시 두 짝(기계 초안 → 편집본 전문).
// 시험 2(26차 B-2): 예시 짝 대신 사람이 쓴 편집 규칙표(docs/03-system/editor-rules.md)를 준다.
// 목적: 사람 편집(병목)을 기계로 옮길 수 있는지 본다. 결과는 운영자가 판정한다.

import { callJson } from "./llm";
import { flagBlocks } from "./filters";
import { normalizePunct, tagsIn } from "./tags";
import { BLOCK_LABEL, BLOCK_ORDER, type LetterBlock } from "./types";

export type DraftText = { title: string; summary: string; blocks: LetterBlock[] };
export type EditorCardFact = { tag: string; text: string; ko: string | null; subject: string | null; year: number | null };

export const EDITOR_SYSTEM = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 편집자다. 기계가 쓴 초안을 고쳐 쓴다.
⟦방식⟧

# 규칙 (엄수)
- 통설을 세우고 되묻기로 끝난다(훅은 물음표로 끝난다).
- 사실 문장은 아래 카드에 있는 것만 쓴다. 카드 문장의 태그([E1] 등)를 문장 끝에 유지한다. 카드에 없는 사실 · 숫자 · 해석을 더하지 않는다.
- 잇는 문장은 사실을 담지 않는다(숫자 · 대상 · 결과 없음). 잇는 문장에는 태그가 없다.
- 블록마다 수치 3개 이하. 표본 크기는 글 전체에서 한 번만.
- 관찰과 처방을 구별하고 처방은 쓰지 않는다("~하라" · "~하십시오" 금지).
- 지시 용어(정설 · 예외 · 기전 · 산업 칸)를 본문에 쓰지 않는다.
- 2~3문장마다 줄을 바꾼다. 3줄 요약은 세 줄.
- 7블록 합계 1,700~2,000자(태그 제외).
- 은유 블록은 사실 문장 없이 비유만. 태그 없음.
- 동물 결과를 사람에게 옮겨 말하지 않는다. "가능성(odds)" 과 "위험(risk)" 을 섞지 않는다. "~일 수 있다" 를 단정하지 않는다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "title": "...", "summary": "한 문장 요약 · 태그 포함", "blocks": { "summary": "...", "hook": "...", "research": "...", "mechanism": "...", "industry": "...", "practice": "...", "metaphor": "..." } }`;

const MODE_EXAMPLES = "예시 두 짝(기계 초안 → 사람 편집본)을 먼저 읽고, 편집이 무엇을 했는지 보고 **같은 방식으로** 고쳐 쓴다.";
const MODE_RULES = "사람 편집자가 한 일을 적은 **편집 규칙표**를 먼저 읽고, 규칙을 하나씩 지켜 고쳐 쓴다. 규칙표와 아래 규칙이 부딪치면 아래 규칙이 먼저다.";

export function renderDraft(d: DraftText): string {
  return [
    `제목: ${d.title}`,
    `한 문장 요약: ${d.summary}`,
    ...d.blocks.map((b) => `## ${BLOCK_LABEL[b.kind]}\n${b.text}`),
  ].join("\n\n");
}

export async function editorPass(input: {
  draft: DraftText;
  cards: EditorCardFact[];
  examples?: { before: DraftText; after: DraftText }[];
  /** 26차 · 편집 규칙표 원문. 있으면 예시 대신 이것을 준다 */
  rules?: string;
  /** 27차 D · 편집자 호출 시험을 Groq 로 */
  provider?: "zai" | "groq";
}): Promise<{ result: DraftText; ms: number; tokens: { input: number; output: number } }> {
  const tokens = { input: 0, output: 0 };
  const ex = input.rules
    ? `# 편집 규칙표\n${input.rules.trim()}`
    : (input.examples ?? [])
        .map((e, i) => `# 예시 ${i + 1} · 기계 초안\n${renderDraft(e.before)}\n\n# 예시 ${i + 1} · 편집본\n${renderDraft(e.after)}`)
        .join("\n\n---\n\n");
  const cards = input.cards
    .map((c) => `[${c.tag}] (대상: ${c.subject ?? "-"}${c.year ? ` · ${c.year}` : ""}) 원문: ${c.text}\n     뜻: ${c.ko ?? "(없음)"}`)
    .join("\n");
  const t0 = Date.now();
  const system = EDITOR_SYSTEM.replace("⟦방식⟧", input.rules ? MODE_RULES : MODE_EXAMPLES);
  const o = (await callJson(
    system,
    `${ex}\n\n---\n\n# 고칠 기계 초안\n${renderDraft(input.draft)}\n\n# 이 글의 카드(고른 문장 · 원문 · 뜻 · 대상 · 연도)\n${cards}\n\n${input.rules ? "위 기계 초안을 편집 규칙표대로" : "위 기계 초안을 예시의 편집처럼"} 고쳐 쓰시오.`,
    9000,
    {
      tier: "main",
      stage: "편집자 호출(시험)",
      temperature: 0.5,
      provider: input.provider,
      usage: (u) => {
        tokens.input += u.input;
        tokens.output += u.output;
      },
    },
  )) as { title?: unknown; summary?: unknown; blocks?: Record<string, unknown> };
  const str = (v: unknown) => (typeof v === "string" ? normalizePunct(v.trim()) : "");
  const blocks: LetterBlock[] = BLOCK_ORDER.map((kind) => {
    const text = str(o.blocks?.[kind]);
    const tags = tagsIn(text);
    return { kind, text, sourceIds: tags.length ? tags : undefined };
  });
  return {
    result: { title: str(o.title) || input.draft.title, summary: str(o.summary), blocks: flagBlocks(blocks) },
    ms: Date.now() - t0,
    tokens,
  };
}
