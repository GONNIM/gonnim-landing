// ① 이슈 고르기의 LLM 호출 네 가지. 모두 light 모델 한 번씩이다(llm.ts · D46).
//
// - proposeQuestions  ⓪-1 [새 이슈 10개 제안] · 1회로 10개
// - fillIssue         [이슈 만들기] 의 [채우기] · 1회
// - judgeRelevance    ⓪-2 V2 · 상위 5편마다 관련 여부와 근거 한 줄 · 1회
// - rewriteQueries    ⓪-2 실패 시 검색어 다시 쓰기 · 1회
//
// 기계는 제안만 한다(넘지 않는 선 8). 여기서 나온 값은 모두 사람이 고칠 수 있는 칸에 들어간다.

import { callJson } from "./llm";
import { AREAS, type Area } from "./questions";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
// 모델이 "AI · 미래" · "AI" 처럼 조금 다르게 쓰는 경우가 있다(18차 검증 실측). 가운뎃점과 공백을 빼고 맞춘다.
const squash = (s: string) => s.replace(/[\s·・‧.]/g, "").toLowerCase();
const toArea = (v: unknown): Area | null => {
  const k = squash(str(v));
  if (!k) return null;
  return AREAS.find((a) => squash(a) === k) ?? AREAS.find((a) => squash(a).startsWith(k)) ?? null;
};
const toQueries = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 2) : [];

const COMMON_RULES = `# 공통 규칙
- 질문은 한국어 한 문장이고 물음표로 끝난다. 독자가 이미 쓰는 쉬운 말로 묻는다.
- 통설(premise)은 독자가 이미 믿는 생각을 한 문장으로 쓴다.
- 되묻기(twist)는 그 통설을 과학이 어떻게 되묻는지 **물음 한 문장**으로 쓴다.
  아직 검증 전이므로 수치나 연구 결과를 단정하지 않는다(예: "…할 수 있는가", "…는 어디서 왔는가").
- 조사와 어미를 갖춘 완전한 문장으로 쓴다. 비유를 쓰지 않는다.
- 의학적 지시("먹지 마세요", "이런 분은 절대")로 읽히는 질문을 만들지 않는다.
- 소설·영화 작품명을 질문 문장에 넣지 않는다.
- 검색어(queries)는 Europe PMC 에서 쓸 영어 학술 검색어 2개다. 따옴표 구문과 AND · OR 를 쓸 수 있다.
  첫째 검색어가 질문의 핵심을 가장 좁게 잡는다.
- 계열(series)은 한국어 한 단어다(예: 노화 · 수면 · 식사 · 감염 · 운동 · 뇌).
- 영역(area)은 다음 10개 중 하나를 글자 그대로 쓴다: ${AREAS.join(" · ")}`;

// ── ⓪-1 제안 ────────────────────────────────────────────────────────────────

export type ProposeBranch = "editorial" | "hypothesis" | "review_title";

const BRANCH_GUIDE: Record<ProposeBranch, string> = {
  editorial:
    "S1 편집 제안: 연구가 쌓여 있고 독자의 몸이나 생활로 이어지는 상설 질문을 낸다. 뉴스가 아니라 오래 두고 쓸 질문이다.",
  hypothesis:
    "S2 과거 가설: 예전에는 소설·영화에서만 가능했던 발상 가운데 지금 논문이 나오는 것을 질문으로 바꾼다. 작품명은 memo 에만 쓴다.",
  review_title:
    "S3 리뷰 제목 변환: 아래 최근 리뷰 논문 제목 목록에서 골라, 독자가 궁금해할 질문으로 바꾼다. 제목을 번역하지 말고 질문으로 다시 쓴다.",
};

export type Proposal = {
  question: string;
  premise: string;
  twist: string;
  series: string;
  area: Area | null;
  queries: string[];
  memo: string | null;
};

export async function proposeQuestions(input: {
  branch: ProposeBranch;
  exclude: string[];
  reviewTitles?: string[];
}): Promise<Proposal[]> {
  const system = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 질문 후보를 낸다.
질문 하나가 레터 한 편이다. 논문은 그 질문의 증거다.

${BRANCH_GUIDE[input.branch]}

${COMMON_RULES}
- 제외 목록에 있는 질문과 같은 뜻의 질문을 내지 않는다. 표현만 바꾼 것도 같은 질문이다.
- 10개가 서로 다른 영역과 계열에 고루 퍼지게 한다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다. items 는 정확히 10개다.
{ "items": [ { "question": "...", "premise": "...", "twist": "...", "series": "...", "area": "...", "queries": ["...", "..."], "memo": "작품명 등 · 없으면 빈 문자열" } ] }`;

  const exclude = input.exclude.length
    ? input.exclude.map((q) => `- ${q}`).join("\n")
    : "(없음)";
  const reviews =
    input.branch === "review_title" && input.reviewTitles?.length
      ? `\n\n# 최근 리뷰 논문 제목\n${input.reviewTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  const parsed = (await callJson(
    system,
    `# 제외 목록 (이미 채택 · 기각 · 보류한 질문)\n${exclude}${reviews}\n\n질문 후보 10개를 JSON 으로 내시오.`,
    6000,
    { tier: "light", stage: "제안" },
  )) as { items?: unknown[] };

  return (parsed.items ?? [])
    .flatMap((it): Proposal[] => {
      const o = (it ?? {}) as Record<string, unknown>;
      const question = str(o.question);
      if (!question) return [];
      return [
        {
          question,
          premise: str(o.premise),
          twist: str(o.twist),
          series: str(o.series),
          area: toArea(o.area),
          queries: toQueries(o.queries),
          memo: str(o.memo) || null,
        },
      ];
    })
    .slice(0, 10);
}

// ── [이슈 만들기] [채우기] ──────────────────────────────────────────────────

export type FillMode = "sentence" | "topic" | "link";

export type Filled = {
  question: string;
  premise: string;
  twist: string;
  series: string;
  area: Area | null;
  queries: string[];
};

export async function fillIssue(input: {
  mode: FillMode;
  /** sentence: 질문 문장 · topic: 주제어 · link: 페이지 제목 */
  text: string;
}): Promise<Filled> {
  const task: Record<FillMode, string> = {
    sentence:
      "운영자가 쓴 질문 문장을 받는다. question 은 받은 문장을 그대로 돌려준다. 나머지 칸을 채운다.",
    topic:
      "운영자가 쓴 주제어나 구절을 받는다. 그 주제로 독자가 궁금해할 질문 하나를 만들고 나머지 칸을 채운다.",
    link:
      "운영자가 본 웹 페이지의 제목만 받는다. 본문은 없다. 제목의 주제로 질문 하나를 만들고 나머지 칸을 채운다. 제목에 없는 사실을 지어내지 않는다.",
  };

  const system = `당신은 한국어 연구·보건 뉴스레터 「지배상식」의 편집을 돕는다.
${task[input.mode]}

${COMMON_RULES}

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "question": "...", "premise": "...", "twist": "...", "series": "...", "area": "...", "queries": ["...", "..."] }`;

  const label = { sentence: "질문 문장", topic: "주제어", link: "페이지 제목" }[input.mode];
  const o = (await callJson(system, `${label}: ${input.text}`, 1500, { tier: "light", stage: "이슈 만들기" })) as Record<string, unknown>;

  return {
    question: input.mode === "sentence" ? input.text.trim() : str(o.question),
    premise: str(o.premise),
    twist: str(o.twist),
    series: str(o.series),
    area: toArea(o.area),
    queries: toQueries(o.queries),
  };
}

// ── ⓪-2 V2 판정 ────────────────────────────────────────────────────────────

export type PaperForJudge = { id: string; title: string; abstract: string };

export type Judged = {
  verdicts: { id: string; relevant: boolean; reason: string }[];
  /** V5 · V6 를 재기 위한 이름. 위키백과 문서 제목과 MedlinePlus 검색어 */
  wikiEn: string | null;
  wikiKo: string | null;
  medline: string | null;
};

export async function judgeRelevance(input: {
  question: string;
  premise: string | null;
  papers: PaperForJudge[];
}): Promise<Judged> {
  const system = `당신은 연구 질문과 논문의 관련성을 판정한다.
질문 하나와 논문 최대 5편(제목 · 초록)을 받는다.

# 판정 기준
- relevant = true: 이 논문의 결과가 질문에 직접 답하거나, 질문의 통설을 확인하거나 깨는 근거가 된다.
- relevant = false: 검색어 단어만 겹치고 질문과 다른 대상 · 다른 주제를 다룬다.
- reason 은 한국어 한 문장으로, 무엇을 다룬 논문이라서 그렇게 판정했는지 쓴다.

# 함께 낼 이름 세 개
- wiki_en: 질문의 주제를 다루는 영어 위키백과 문서 제목 하나(예: "Sleep debt"). 모르면 빈 문자열.
- wiki_ko: 한국어 위키백과 문서 제목 하나(예: "수면 부채"). 모르면 빈 문자열.
- medline: MedlinePlus 건강 주제 검색에 넣을 영어 검색어 1~3단어. 건강 주제가 아니면 빈 문자열.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다.
{ "verdicts": [ { "id": "...", "relevant": true, "reason": "..." } ], "wiki_en": "...", "wiki_ko": "...", "medline": "..." }`;

  const papers = input.papers
    .map((p) => `[${p.id}]\n제목: ${p.title}\n초록: ${p.abstract.slice(0, 1200) || "(없음)"}`)
    .join("\n\n");
  const o = (await callJson(
    system,
    `질문: ${input.question}\n통설: ${input.premise ?? "-"}\n\n${papers || "(논문 없음)"}`,
    2500,
    { tier: "light", stage: "검증" },
  )) as Record<string, unknown>;

  const ids = new Set(input.papers.map((p) => p.id));
  const verdicts = (Array.isArray(o.verdicts) ? o.verdicts : [])
    .flatMap((v) => {
      const r = (v ?? {}) as Record<string, unknown>;
      const id = str(r.id);
      if (!ids.has(id)) return [];
      return [{ id, relevant: r.relevant === true, reason: str(r.reason) || "근거 없음" }];
    });

  return {
    verdicts,
    wikiEn: str(o.wiki_en) || null,
    wikiKo: str(o.wiki_ko) || null,
    medline: str(o.medline) || null,
  };
}

// ── ⓪-2 검색어 다시 쓰기 ────────────────────────────────────────────────────

export async function rewriteQueries(input: {
  question: string;
  queries: string[];
  failure: string;
  reasons: string[];
}): Promise<string[]> {
  const system = `당신은 Europe PMC 검색어를 고친다.
질문, 지금 검색어, 실패 이유, 상위 논문 판정 근거를 받는다.
질문의 대상과 결과를 더 정확히 잡는 영어 검색어 2개를 낸다. 따옴표 구문과 AND · OR 를 쓸 수 있다.
첫째 검색어가 가장 좁고 정확해야 한다. 지금 검색어를 그대로 돌려주지 않는다.

# 출력 형식 (엄수)
{ "queries": ["...", "..."] }`;

  const o = (await callJson(
    system,
    `질문: ${input.question}\n지금 검색어: ${input.queries.join(" / ")}\n실패 이유: ${input.failure}\n판정 근거:\n${input.reasons.map((r) => `- ${r}`).join("\n") || "(없음)"}`,
    800,
    { tier: "light", stage: "검증(검색어 다시 쓰기)" },
  )) as Record<string, unknown>;

  const q = toQueries(o.queries);
  if (q.length === 0) throw new Error("검색어를 다시 쓰지 못했습니다");
  return q;
}
