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

export type SentenceCandidate = {
  text: string;
  subject: string | null;
  year: number | null;
  hasNumber: boolean;
  /** 한국어 뜻 한 줄(D44 · 미확인) */
  ko: string | null;
};

/** 확인된 뜻(D44)을 만드는 규칙 · 배정 호출과 일괄 생성 호출이 같이 쓴다 */
export const KO_RULES = `# 한국어 뜻(ko) 규칙 (D44)
- 원문 문장 하나의 뜻을 한국어 한 문장으로 쓴다. 뜻을 더하거나 빼지 않는다.
- **통계 표현은 뜻으로 푼다.** 예: "50% of the optimal dose" → "가장 큰 효과의 절반이 나오는 걸음 수".
  "hazard ratio 0.60" → "위험이 약 40% 낮았다" 처럼 방향과 크기만 쓴다. 신뢰구간은 쓰지 않는다.
- 위험비 · 사분위 · 스플라인 · 다변량 보정 같은 통계 이름을 쓰지 않는다.
- **수치는 원문 그대로 둔다.** 반올림하거나 바꾸지 않는다(10 000 → 10,000 처럼 표기만 한국식으로).
- 연관을 원인으로 바꾸지 않는다. "~와 관련이 있었다" 를 "~ 때문이다" 로 쓰지 않는다. "~일 수 있다" 를 단정하지 않는다.
- **원문의 권고 · 가능성 표현(should · may · might · suggest)은 결과로 바꾸지 않는다.** "~해야 한다" · "~일 수 있다" 로 남긴다.
- 원문에 없는 한정어를 붙이지 않는다(예: "general obesity" 를 "비복부 비만" 으로 쓰지 않는다).
- **odds(ratio)는 "가능성", risk · hazard 는 "위험".** 둘을 섞지 않는다(25차).
- **대상과 연도를 문장 안에 넣는다.** 예: "2022년 메타분석에서 성인 47,471명 중 …".`;

export type Assignment = {
  key: string;
  slot: Exclude<Slot, "industry"> | "none";
  reason: string;
  /** 질문과의 관련도(26차 A-3) · 0 무관 · 1 주변 · 2 직접 */
  relevance: 0 | 1 | 2;
  relevanceReason: string;
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
          ko: str(o.ko) || null,
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
            **실험에서 무엇을 바꿔(조작) 결과가 달라진 것**을 본 논문. 연관만 본 관찰 연구는 기전이 아니다.
            단, 질문의 "왜" 가 몸속 경로가 아니라 **숫자의 유래나 용량-반응 곡선**이면(예: 하루 몇 보가 적당한가),
            용량-반응 연구가 기전 칸의 재료다. 그때는 배정 이유에 "용량-반응" 이라고 적는다
- none      해당 없음: 질문과 관련이 약하다

# 관련도 (논문마다 엄수)
- 2 직접: 질문의 원인과 결과를 그대로 다룬다(예: 질문이 "수면과 기억" 이면 잠을 바꿔 기억이 어떻게 되는지 본 연구).
- 1 주변: 질문의 한쪽만 다루거나, 대상 · 상황이 질문과 다르지만 글의 배경으로 쓸 수 있다.
- 0 무관: 질문의 낱말이 겹칠 뿐 다른 원인을 본다(예: 수면과 기억 질문에 카페인 음료 · 수면제 성분 · 조명 색 실험).
  **질문의 원인(예: 운동 · 수면)이 아니라 다른 것(먹을거리 · 약 · 성분 · 순서)을 바꾼 실험은 0 이다.**
- relevance_reason 에 한국어 한 문장으로 이유를 적는다. 0 이면 slot 은 none, sentences 는 빈 배열.

# 사실 문장 규칙 (엄수)
- 초록에 있는 문장을 **한 글자도 바꾸지 않고** 그대로 옮긴다. 줄이거나 이어 붙이거나 번역하지 않는다.
- 한 문장씩, 논문마다 1~3개. none 이면 빈 배열.
- 대상(subject)은 한국어로 짧게 쓴다(예: "영국 성인 72,174명", "늙은 쥐"). 모르면 빈 문자열.
- year 는 논문 출판 연도. has_number 는 문장에 수치가 있으면 true.
- 수치 · 대상 · 결과가 분명한 문장을 고른다. 배경 설명만 있는 문장은 고르지 않는다.
- reason 은 한국어 한 문장으로 쓰고, **"경로 · 물질 · 실험 조작 중 무엇이 있는가"** 를 밝힌다
  (예: "물질: 코르티솔 변화를 측정함", "실험 조작: 수면을 5일 제한한 뒤 회복시킴", "용량-반응: 걸음 수에 따른 위험 곡선", "셋 다 없음: 설문 연관만 봄 → 예외").
- **세 칸이 고루 차게 한다.** 결과 논문이 많아도 예외 칸에만 몰지 않는다. 경로 · 물질 · 실험 조작을 보인 논문은 기전으로,
  통설 자체나 그 근거를 정리한 리뷰는 정설로 보낸다. 한 칸에 8편을 넘기지 않는다.
  단, 기전 칸을 채우려고 연관 연구를 기전으로 보내지 않는다. 기전 논문이 없으면 기전 칸은 비워 둔다.
- 문장마다 한국어 뜻(ko)을 함께 쓴다. 아래 규칙을 따른다.

${KO_RULES}

# 출력 형식 (엄수)
다른 설명 없이 JSON 만 반환한다. key 는 받은 값을 그대로 쓴다.
{ "items": [ { "key": "...", "relevance": 2, "relevance_reason": "...", "slot": "exception", "reason": "...", "sentences": [ { "text": "...", "subject": "...", "year": 2024, "has_number": true, "ko": "..." } ] } ] }`;

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
    const rel = Number(r.relevance);
    // 관련도를 안 적었으면 주변(1)으로 본다. 0 이면 칸을 비운다.
    const relevance: Assignment["relevance"] = rel === 0 || rel === 1 || rel === 2 ? rel : 1;
    const slot =
      relevance > 0 && ["premise", "exception", "mechanism"].includes(str(r.slot))
        ? (str(r.slot) as Assignment["slot"])
        : "none";
    return [
      {
        key,
        slot,
        reason: str(r.reason) || "이유 없음",
        relevance,
        relevanceReason: str(r.relevance_reason) || "이유 없음",
        sentences: slot === "none" ? [] : toSentences(r.sentences, 3),
      },
    ];
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
- 문장마다 한국어 뜻(ko)을 함께 쓴다.

${KO_RULES}

# 출력 형식 (엄수)
{ "items": [ { "key": "...", "sentences": [ { "text": "...", "subject": "...", "year": null, "has_number": false, "ko": "..." } ] } ] }`;

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

// ── 확인된 뜻 일괄 생성 (D44 · 22차 A-5) ─────────────────────────────────────

export type KoInput = { id: string; text: string; subject: string | null; year: number | null; source: string };

/** 이미 저장된 문장들의 한국어 뜻을 한 번에 만든다. 확인은 사람이 한다. */
export async function translateFacts(
  question: string,
  facts: KoInput[],
): Promise<Map<string, string>> {
  const system = `당신은 한국어 연구·보건 뉴스레터의 증거 담당이다. 논문 문장(원문)마다 한국어 뜻 한 줄을 만든다.

${KO_RULES}

# 출력 형식 (엄수)
{ "items": [ { "id": "...", "ko": "..." } ] }  · id 는 받은 값 그대로`;
  const body = facts
    .map((f) => `[${f.id}] (출처: ${f.source} · 대상: ${f.subject ?? "-"} · ${f.year ?? "연도 없음"}) ${f.text}`)
    .join("\n");
  const o = (await callJson(system, `질문: ${question}\n\n${body}`, 6000, { temperature: 0.2 })) as { items?: unknown[] };
  const out = new Map<string, string>();
  const ids = new Set(facts.map((f) => f.id));
  for (const it of o.items ?? []) {
    const r = (it ?? {}) as Record<string, unknown>;
    const id = str(r.id);
    const ko = str(r.ko);
    if (ids.has(id) && ko) out.set(id, ko);
  }
  return out;
}
