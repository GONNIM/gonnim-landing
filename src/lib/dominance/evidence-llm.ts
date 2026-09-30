// ② [증거 모으기] 의 LLM 호출. 모두 z.ai GLM 한 번씩이다.
//
// - assignAndExtract  논문마다 칸 배정 · 이유 한 줄 · 초록의 사실 문장 후보 1~3개
// - premiseFromBody   정설 칸이 비었을 때, CC BY 논문 서론에서 유래 · 통설 문장 2개까지 (D43)
// - industryLeads     산업 칸 · 관련 기업 · 기관 이름 3개와 검색어 (자동으로 넣지 않는다)
//
// 모델이 낸 문장은 믿지 않는다. 프로그램이 원문과 글자 그대로 대조해 통과한 것만 저장한다.

import { callJson } from "./question-llm";
import type { Slot } from "./evidence";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type Candidate = { key: string; title: string; abstract: string; year: string | null; isReview: boolean };

export type SentenceCandidate = { text: string; subject: string | null; year: number | null; hasNumber: boolean };

export type Assignment = {
  key: string;
  slot: Exclude<Slot, "industry"> | "none";
  reason: string;
  sentences: SentenceCandidate[];
};

function toSentences(v: unknown, max: number): SentenceCandidate[] {
  return (Array.isArray(v) ? v : [])
    .flatMap((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const text = str(o.text);
      if (!text) return [];
      const year = Number(o.year);
      return [
        {
          text,
          subject: str(o.subject) || null,
          year: Number.isFinite(year) && year > 1800 ? year : null,
          hasNumber: o.has_number === true,
        },
      ];
    })
    .slice(0, max);
}

export async function assignAndExtract(input: {
  question: string;
  premise: string | null;
  twist: string | null;
  papers: Candidate[];
}): Promise<Assignment[]> {
  const system = `당신은 한국어 연구·보건 뉴스레터의 증거 담당이다. 질문 하나와 논문 여러 편(제목 · 초록)을 받는다.
논문마다 재료 칸을 하나 배정하고, 초록에서 사실 문장 후보를 뽑는다.

# 칸
- premise   정설: 독자가 믿는 통설이나 그 유래, 오래 알려진 사실을 적은 논문(주로 리뷰)
- exception 예외: 통설을 깨거나 한계를 보인 결과. **관찰 연구에서 연관만 본 것은 모두 여기다**(코호트 · 단면 조사 · 설문)
- mechanism 기전: **몸 안의 경로나 물질**(호르몬 · 유전자 · 세포 · 신경 회로 등)을 다루거나,
            **실험에서 무엇을 바꿔(조작) 결과가 달라진 것**을 본 논문. 연관만 본 관찰 연구는 기전이 아니다
- none      해당 없음: 질문과 관련이 약하다

# 사실 문장 규칙 (엄수)
- 초록에 있는 문장을 **한 글자도 바꾸지 않고** 그대로 옮긴다. 줄이거나 이어 붙이거나 번역하지 않는다.
- 한 문장씩, 논문마다 1~3개. none 이면 빈 배열.
- 대상(subject)은 한국어로 짧게 쓴다(예: "영국 성인 72,174명", "늙은 쥐"). 모르면 빈 문자열.
- year 는 논문 출판 연도. has_number 는 문장에 수치가 있으면 true.
- 수치 · 대상 · 결과가 분명한 문장을 고른다. 배경 설명만 있는 문장은 고르지 않는다.
- reason 은 한국어 한 문장으로 쓰고, **"경로 · 물질 · 실험 조작 중 무엇이 있는가"** 를 밝힌다
  (예: "물질: 코르티솔 변화를 측정함", "실험 조작: 수면을 5일 제한한 뒤 회복시킴", "셋 다 없음: 설문 연관만 봄 → 예외").
- **세 칸이 고루 차게 한다.** 결과 논문이 많아도 예외 칸에만 몰지 않는다. 경로 · 물질 · 실험 조작을 보인 논문은 기전으로,
  통설 자체나 그 근거를 정리한 리뷰는 정설로 보낸다. 한 칸에 8편을 넘기지 않는다.
  단, 기전 칸을 채우려고 연관 연구를 기전으로 보내지 않는다. 기전 논문이 없으면 기전 칸은 비워 둔다.

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다. key 는 받은 값을 그대로 쓴다.
{ "items": [ { "key": "...", "slot": "exception", "reason": "...", "sentences": [ { "text": "...", "subject": "...", "year": 2024, "has_number": true } ] } ] }`;

  const papers = input.papers
    .map(
      (p) =>
        `[${p.key}]${p.isReview ? " (리뷰)" : ""} ${p.year ?? ""}\n제목: ${p.title}\n초록: ${p.abstract.slice(0, 2600) || "(없음)"}`,
    )
    .join("\n\n");
  const o = (await callJson(
    system,
    `질문: ${input.question}\n통설: ${input.premise ?? "-"}\n되묻기: ${input.twist ?? "-"}\n\n${papers}`,
    14000,
  )) as { items?: unknown[] };

  const keys = new Set(input.papers.map((p) => p.key));
  return (o.items ?? []).flatMap((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    const key = str(r.key);
    if (!keys.has(key)) return [];
    const slot = ["premise", "exception", "mechanism"].includes(str(r.slot))
      ? (str(r.slot) as Assignment["slot"])
      : "none";
    return [{ key, slot, reason: str(r.reason) || "이유 없음", sentences: slot === "none" ? [] : toSentences(r.sentences, 3) }];
  });
}

export async function premiseFromBody(input: {
  question: string;
  premise: string | null;
  intros: { key: string; title: string; text: string }[];
}): Promise<{ key: string; sentences: SentenceCandidate[] }[]> {
  const system = `당신은 한국어 연구·보건 뉴스레터의 증거 담당이다. 질문 하나와 논문 서론 몇 편을 받는다.
서론에서 통설의 **유래**나 **널리 알려진 통설 자체**를 적은 문장을 찾는다.

# 규칙 (엄수)
- 서론의 문장을 **한 글자도 바꾸지 않고** 그대로 옮긴다.
- 논문마다 많아야 2문장. 없으면 빈 배열.
- 대상(subject)은 한국어로 짧게. year 는 문장이 말하는 연도가 있으면 그 연도, 없으면 null. has_number 는 수치가 있으면 true.

# 출력 형식 (엄수)
{ "items": [ { "key": "...", "sentences": [ { "text": "...", "subject": "...", "year": null, "has_number": false } ] } ] }`;

  const body = input.intros.map((p) => `[${p.key}] ${p.title}\n서론: ${p.text}`).join("\n\n");
  const o = (await callJson(
    system,
    `질문: ${input.question}\n통설: ${input.premise ?? "-"}\n\n${body}`,
    3000,
  )) as { items?: unknown[] };
  const keys = new Set(input.intros.map((p) => p.key));
  return (o.items ?? []).flatMap((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    const key = str(r.key);
    return keys.has(key) ? [{ key, sentences: toSentences(r.sentences, 2) }] : [];
  });
}

export type IndustryLead = {
  name: string;
  /** 영어 검색어 (EDGAR · RePORTER) */
  query: string;
  /** 한국 기업이면 한국어 회사 이름 (DART) */
  koName: string | null;
  why: string;
};

export async function industryLeads(input: { question: string; premise: string | null }): Promise<IndustryLead[]> {
  const system = `당신은 한국어 연구·보건 뉴스레터의 산업 칸을 돕는다. 질문 하나를 받는다.
이 질문과 이어지는 기업 · 기관 이름 3개를 낸다. 공시 · 연구비 검색에 쓸 것이다.

# 규칙
- 실제로 있는 곳만 쓴다. 모르면 적게 낸다.
- **대학과 병원은 내지 않는다.** 이 질문과 이어지는 제품 · 서비스를 파는 기업(상장사 우선, 한국 기업 포함)이나,
  이 주제에 돈을 대거나 규제하는 정부 기관을 낸다.
- query 는 SEC EDGAR 전문 검색과 NIH RePORTER 에 넣을 영어 검색어(2~4단어)다.
- 한국 기업이면 ko_name 에 DART 에 등록된 한국어 회사 이름을 쓴다. 아니면 빈 문자열.
- why 는 이 질문과 어떻게 이어지는지 한국어 한 문장.

# 출력 형식 (엄수)
{ "items": [ { "name": "...", "query": "...", "ko_name": "", "why": "..." } ] }`;

  const o = (await callJson(system, `질문: ${input.question}\n통설: ${input.premise ?? "-"}`, 1200)) as {
    items?: unknown[];
  };
  return (o.items ?? [])
    .flatMap((it) => {
      const r = (it ?? {}) as Record<string, unknown>;
      const name = str(r.name);
      if (!name) return [];
      return [{ name, query: str(r.query) || name, koName: str(r.ko_name) || null, why: str(r.why) }];
    })
    .slice(0, 3);
}
