// 60차 B · 「기록」 상세의 변환 · 발행된 글 한 편을 블로그 글 · 쇼츠 대본으로 바꾼다.
//
// 입력은 letterPackage(id) 하나뿐이다. 글의 DB 행은 바꾸지 않는다.
// 결과는 ds-drafts/<글 id>/convert/blog-<시각>.md · shorts-<시각>.md 에 남긴다.
// - 블로그 글: 코드만 쓴다(LLM 없음). 본문 문장은 그대로 옮기고, 블록을 소제목 넷으로 묶고, 태그를 각주 번호로 바꾼다.
// - 쇼츠 대본: 62차부터 callJsonWithFallback(Anthropic → OpenAI → GLM) 한 번. 코드 검사에 걸리면 이유를 붙여 한 번 다시 부른다. 호출 기록 · 비용은 llm-calls 에 남는다(chat).
// 파일 첫 줄은 만든 정보(모델 · 토큰 · 비용 · 검사)를 담은 HTML 주석이다. 화면과 「복사」는 이 줄을 뺀다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { callJsonWithFallback, costOf, type FallbackProvider, type FallbackResult, type Usage } from "./llm";
import { extractNumbers } from "./card-check";
import { DRAFT_BUCKET } from "./draft-store";
import { categoryTerms, flagBlock } from "./filters";
import type { LetterPackage } from "./letter-package";
import { HYPE } from "./title-suggest";
import type { BlockKind, LetterBlock } from "./types";

export type ConvertKind = "blog" | "shorts";
export const CONVERT_LABEL: Record<ConvertKind, string> = { blog: "블로그 글", shorts: "쇼츠 대본" };

export type ConvertInfo = {
  kind: ConvertKind;
  at: string;
  model: string | null;
  tokens: { input: number; output: number } | null;
  cost: number | null;
  /** 쇼츠 · 다시 부른 뒤에도 남은 검사 이유(빈 배열이면 통과) */
  problems: string[];
  attempts: number;
  /** 62차 B · 쇼츠 · 답한 공급자와 앞 단계 실패 이유(제목 추천과 같은 모양) */
  provider?: FallbackProvider | null;
  failures?: FallbackResult["failures"];
};
export type ConvertFile = { name: string; info: ConvertInfo; text: string };

const TAG = /\[([A-Z]{1,2}[0-9]{0,2})\]/g;
const BLOG_TAIL = "이 글은 메일로 먼저 나갑니다 → gonnim.dev/sangsik";

/** 소제목 넷 · 블록 묶음. 훅과 3줄 요약은 소제목 앞(머리)에 둔다 */
const BLOG_SECTIONS: { heading: string; kinds: BlockKind[] }[] = [
  { heading: "연구가 확인한 것", kinds: ["research"] },
  { heading: "왜 그런가", kinds: ["mechanism", "metaphor"] },
  { heading: "산업은 어디로", kinds: ["industry"] },
  { heading: "내 몸에 적용하면", kinds: ["practice"] },
];

/** 블로그 글(마크다운). 본문 글자는 바꾸지 않고 태그만 [1] 같은 번호로 바꾼다 */
export function blogMarkdown(pkg: LetterPackage): string {
  const number = new Map<string, number>();
  const known = new Set(pkg.sources.map((s) => s.tag).filter((t): t is string => !!t));
  const cite = (text: string) =>
    text.replace(TAG, (whole, tag: string) => {
      if (!known.has(tag)) return whole;
      if (!number.has(tag)) number.set(tag, number.size + 1);
      return `[${number.get(tag)}]`;
    });
  const textOf = (kind: BlockKind) => pkg.blocks.find((b) => b.kind === kind)?.text.trim() ?? "";

  const out: string[] = [`# ${pkg.title}`, ""];
  if (pkg.summary) out.push(`> ${cite(pkg.summary)}`, "");
  for (const kind of ["hook", "summary"] as BlockKind[]) {
    const t = textOf(kind);
    if (t) out.push(cite(t), "");
  }
  for (const s of BLOG_SECTIONS) {
    const parts = s.kinds.map(textOf).filter(Boolean);
    if (!parts.length) continue;
    out.push(`## ${s.heading}`, "", ...parts.flatMap((t) => [cite(t), ""]));
  }
  // 원천 · 본문에 나온 순서대로 번호. 본문에 안 나온 원천은 싣지 않는다
  const listed = [...number.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([tag, n]) => {
      const s = pkg.sources.find((x) => x.tag === tag)!;
      return `${n}. [${s.title}](${s.url}) · ${s.kind}`;
    });
  if (listed.length) out.push("## 원천", "", ...listed, "");
  out.push("---", "", BLOG_TAIL);
  return out.join("\n");
}

type Shorts = { hook: string; core: string[]; closing: string; captions: string[] };

const SHORTS_SYSTEM = `너는 한국어 과학 레터를 60초 세로 영상(쇼츠) 대본으로 옮기는 편집자다.
입력은 이미 발행된 글 한 편(제목 · 한 문장 요약 · 본문 7블록)이다. 이 글에 있는 사실만 쓴다.
만들 것:
- hook: 첫 3초에 읽는 훅 1문장.
- core: 핵심 3문장. 본문의 「3줄 요약」 세 줄을 하나씩 근거로 삼아 말로 읽기 쉽게 옮긴다.
- closing: 마무리 1문장.
- captions: 화면 자막 5줄. 한 줄 20자 안. 대본을 따라가는 짧은 말.
지킬 것:
- core 의 칸 하나에는 문장 하나만 쓴다. 마침표나 물음표는 칸마다 끝에 한 번만 온다.
- 말투는 「~습니다」로 통일한다. hook · core · closing 의 문장은 「~니다.」로 끝내고, 묻는 문장은 「~까?」나 「~까요?」로 끝낸다. 그 밖의 「~요」 끝맺음(「~어요」 · 「~해요」 · 「~네요」 · 「~죠」 등)은 쓰지 않는다. 자막은 짧은 말이라 이 규칙에서 뺀다.
- 소리 내어 읽는 글(hook + core + closing)은 모두 합쳐 공백 빼고 300자 안(60초 안).
- 글에 없는 수치 · 글에 없는 단정 금지. 수치는 글에 나온 그대로만 쓴다.
- 과장 낱말(충격 · 경악 · 반드시 · 무조건 · 100% · 모두가) 금지. 느낌표 금지.
- 의학적 지시(복용하십시오 · 권장 용량 · 치료된다 · 효과가 있습니다 등) 금지. 실천은 "연구에서는 ~했다" 처럼 사실로만 말한다.
- 태그([P5] 같은 꼬리표) · 번역하지 않은 영어 낱말 · 지시문의 범주 이름("반직관" · "통설 파괴" 등) 금지.
출력: {"hook":"…","core":["…","…","…"],"closing":"…","captions":["…","…","…","…","…"]}`;

/** 61차 B · 문장 끝(마침표 · 물음표 · 느낌표 뒤에 빈칸이나 글 끝). 6.5 같은 소수점은 세지 않는다 */
const SENTENCE_END = /[.?!？](?=\s|$)/g;
export const sentenceCount = (t: string) => Math.max(1, (t.trim().match(SENTENCE_END) ?? []).length);
/** 62차 A · 허용 끝맺음은 「~니다.」 · 「~까?」 · 「~까요?」. 그 밖의 「~요」 끝맺음(~어요 · ~해요 · ~네요 · ~죠 등)만 실패다 */
const YO_END = /(요|죠)[.?!？]?$/;
const ALLOWED_YO = /까요[?？]$/;
/** 62차 A · 「~요」 끝맺음인데 「~까요?」가 아닌 문장을 돌려준다 */
function yoSentences(t: string): string[] {
  return t
    .trim()
    .split(/(?<=[.?!？])\s+/)
    .map((x) => x.trim())
    .filter((x) => x && YO_END.test(x) && !ALLOWED_YO.test(x));
}

const spokenLen = (s: Shorts) => [s.hook, ...s.core, s.closing].join("").replace(/\s+/g, "").length;

/** 쇼츠 대본 코드 검사. 이유 목록(빈 배열이면 통과) */
export function shortsProblems(s: Shorts, pkg: LetterPackage): string[] {
  const out: string[] = [];
  if (!s.hook.trim()) out.push("훅 없음");
  if (s.core.length !== 3 || s.core.some((c) => !c.trim())) out.push(`핵심 문장 ${s.core.length}개(3개여야 함)`);
  if (!s.closing.trim()) out.push("마무리 없음");
  if (s.captions.length !== 5 || s.captions.some((c) => !c.trim())) out.push(`자막 ${s.captions.length}줄(5줄이어야 함)`);
  const longCap = s.captions.filter((c) => c.replace(/\s+/g, "").length > 20);
  if (longCap.length) out.push(`자막 20자 넘음 ${longCap.length}줄`);
  // 61차 B · 핵심 칸마다 문장 하나 · 말투 「~습니다」
  s.core.forEach((c, i) => {
    const n = sentenceCount(c);
    if (n > 1) out.push(`핵심 ${i + 1}번 문장 ${n}개(한 칸 한 문장)`);
  });
  const spoken: [string, string][] = [["훅", s.hook], ...s.core.map((c, i): [string, string] => [`핵심 ${i + 1}번`, c]), ["마무리", s.closing]];
  for (const [name, text] of spoken) {
    const bad = yoSentences(text);
    if (bad.length) out.push(`${name} 「~요」 끝맺음(「~니다.」 · 「~까?」 · 「~까요?」만 허용) · 「${bad[0].slice(-12)}」`);
  }
  const len = spokenLen(s);
  if (len > 300) out.push(`읽는 글 ${len}자(300자 안이어야 함)`);
  const all = [s.hook, ...s.core, s.closing, ...s.captions];
  const joined = all.join("\n");
  const hype = HYPE.filter((w) => joined.includes(w));
  if (hype.length) out.push(`과장 낱말 ${hype.join(" · ")}`);
  if (/[!！]/.test(joined)) out.push("느낌표");
  if (TAG.test(joined)) out.push("태그를 씀");
  TAG.lastIndex = 0;
  for (const line of all) {
    for (const f of flagBlock({ kind: "hook", text: line } as LetterBlock)) out.push(`${f} · 「${line.slice(0, 30)}」`);
  }
  const terms = categoryTerms(joined);
  if (terms.length) out.push(`범주 이름 ${terms.join(" · ")}`);
  // 글(제목 · 요약 · 본문)에 있는 수치만 허용 · 이 글은 리뷰에서 카드와 맞춰 본 글이다
  const known = new Set([pkg.title, pkg.summary ?? "", ...pkg.blocks.map((b) => b.text)].flatMap((t) => extractNumbers(t).map((n) => n.value)));
  const extra = [...new Set(all.flatMap((t) => extractNumbers(t).map((n) => n.value)).filter((v) => !known.has(v)))];
  if (extra.length) out.push(`글에 없는 수치 ${extra.join(", ")}`);
  return [...new Set(out)];
}

function shortsMarkdown(pkg: LetterPackage, s: Shorts): string {
  return [
    `# 쇼츠 대본 · ${pkg.title}`,
    "",
    `읽는 글 ${spokenLen(s)}자(공백 뺌) · 60초 안`,
    "",
    "## 훅",
    "",
    s.hook,
    "",
    "## 핵심",
    "",
    ...s.core.map((c, i) => `${i + 1}. ${c}`),
    "",
    "## 마무리",
    "",
    s.closing,
    "",
    "## 화면 자막",
    "",
    ...s.captions.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

async function makeShorts(pkg: LetterPackage): Promise<{ text: string; info: Omit<ConvertInfo, "kind" | "at"> }> {
  const user = [
    `제목: ${pkg.title}`,
    `한 문장 요약: ${pkg.summary ?? "(없음)"}`,
    "",
    "본문(블록 7개):",
    ...pkg.blocks.map((b) => `## ${b.label}\n${b.text.replace(TAG, "")}`),
  ].join("\n");
  const tokens = { input: 0, output: 0 };
  let cost: number | null = 0;
  const usage = (u: Usage) => {
    tokens.input += u.input;
    tokens.output += u.output;
    const c = costOf(u);
    cost = cost === null || c === null ? null : cost + c;
  };
  let best: Shorts | null = null;
  let problems: string[] = [];
  let attempts = 0;
  let last: FallbackResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    const prompt = attempt === 0 ? user : `${user}\n\n앞서 낸 대본이 검사에 걸렸다. 이유: ${problems.join(" / ")}\n이유를 고쳐 다시 낸다.`;
    last = await callJsonWithFallback(SHORTS_SYSTEM, prompt, 2000, {
      stage: attempt === 0 ? "변환 · 쇼츠 대본" : "변환 · 쇼츠 대본(검사 뒤 다시)",
      usage,
    });
    const raw = last.data as Partial<Shorts>;
    const s: Shorts = {
      hook: String(raw.hook ?? "").trim(),
      core: (Array.isArray(raw.core) ? raw.core : []).map((x) => String(x).trim()),
      closing: String(raw.closing ?? "").trim(),
      captions: (Array.isArray(raw.captions) ? raw.captions : []).map((x) => String(x).trim()),
    };
    best = s;
    problems = shortsProblems(s, pkg);
    if (!problems.length) break;
  }
  return { text: shortsMarkdown(pkg, best!), info: { model: last!.model, tokens, cost, problems, attempts, provider: last!.provider, failures: last!.failures } };
}

const INFO_RE = /^<!-- convert (\{.*\}) -->\n/;

export async function makeConversion(db: SupabaseClient, pkg: LetterPackage, kind: ConvertKind): Promise<ConvertFile> {
  const at = new Date().toISOString();
  const made =
    kind === "blog"
      ? { text: blogMarkdown(pkg), info: { model: null, tokens: null, cost: 0, problems: [], attempts: 0 } }
      : await makeShorts(pkg);
  const info: ConvertInfo = { kind, at, ...made.info };
  const name = `${kind}-${at.replace(/[:.]/g, "-")}.md`;
  const body = `<!-- convert ${JSON.stringify(info)} -->\n${made.text}`;
  const { error } = await db.storage
    .from(DRAFT_BUCKET)
    .upload(`${pkg.id}/convert/${name}`, new Blob([body], { type: "text/markdown; charset=utf-8" }), { upsert: false });
  if (error) throw new Error(`변환 파일을 쓰지 못했습니다: ${error.message}`);
  return { name, info, text: made.text };
}

/** 이미 만든 변환 파일 · 새것부터 */
export async function listConversions(db: SupabaseClient, letterId: string): Promise<ConvertFile[]> {
  const { data } = await db.storage.from(DRAFT_BUCKET).list(`${letterId}/convert`, { limit: 100 });
  const names = (data ?? []).map((f) => f.name).filter((n) => /^(blog|shorts)-.*\.md$/.test(n));
  const files = await Promise.all(
    names.map(async (name): Promise<ConvertFile | null> => {
      const { data: blob } = await db.storage.from(DRAFT_BUCKET).download(`${letterId}/convert/${name}`);
      if (!blob) return null;
      const raw = await blob.text();
      const m = raw.match(INFO_RE);
      let info: ConvertInfo | null = null;
      try {
        info = m ? (JSON.parse(m[1]) as ConvertInfo) : null;
      } catch {
        info = null;
      }
      const kind: ConvertKind = name.startsWith("blog-") ? "blog" : "shorts";
      return { name, info: info ?? { kind, at: "", model: null, tokens: null, cost: null, problems: [], attempts: 0 }, text: m ? raw.slice(m[0].length) : raw };
    }),
  );
  return files.filter((f): f is ConvertFile => !!f).sort((a, b) => b.name.localeCompare(a.name));
}
