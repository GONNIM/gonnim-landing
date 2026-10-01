// 레터 행을 만들고 고치는 공통 동작. 서버 액션과 크론이 같은 경로를 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { kstToday } from "./kst";
import {
  AGENCY_LABEL,
  LICENSE_LABEL,
  SOURCE_LABEL,
  type LetterBlock,
} from "./types";

/** 한국어 제목은 주소에 넣기 어렵다. 날짜와 짧은 난수로 만든다. */
export function makeSlug(date: string = kstToday()): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${date}-${suffix}`;
}

export type LoadedSource = {
  label: string;
  title: string;
  url: string;
  abstract: string | null;
  attribution: string | null;
  /** 비어 있으면 표시하지 않는다 (link_only). */
  licenseLabel: string;
  /** 본문의 인라인 태그 [E1] 와 짝을 맞추는 이름. 옛 글과 스키마 적용 전에는 null. */
  tag: string | null;
  /** 외부 원천의 종류(ds_letter_sources.ext_source_kind). 논문 · 보도자료는 null. */
  extKind: string | null;
};

// 외부 원천(ds_letter_sources.ext_*)의 표시 이름. 제목에서 기관을 알 수 없으므로 종류 이름만 쓴다.
const EXT_KIND_LABEL: Record<string, string> = {
  agency: "정부 기관 고지",
  disclosure_us: "미국 증권거래위원회 공시",
  disclosure_kr: "전자공시",
  grant: "연구비 기록",
  registry: "임상시험 등록",
  company_press: "기업 발표",
  news: "언론",
  own: "지배상식 집계",
};

function licenseLabel(license: string | null | undefined): string {
  if (!license || license === "link_only") return "";
  if (license === "kogl_1") return "공공누리 제1유형";
  return LICENSE_LABEL[license] ?? license;
}

const SOURCE_SELECT_BASE = `
  paper:ds_papers ( source, title, abstract, landing_url, license ),
  gov_press:ds_gov_press ( agency, title, body, landing_url, attribution )
`;

// 2026-09-28 질문 스키마(D29)가 더한 열. 운영자가 SQL 을 실행하기 전에는 없다.
const SOURCE_SELECT_EXT = `
  tag, ext_url, ext_title, ext_source_kind, license,
  ${SOURCE_SELECT_BASE}
`;

type SourceRow = {
  tag?: string | null;
  ext_url?: string | null;
  ext_title?: string | null;
  ext_source_kind?: string | null;
  license?: string | null;
  paper: {
    source: string;
    title: string;
    abstract: string | null;
    landing_url: string;
    license: string;
  } | null;
  gov_press: {
    agency: string;
    title: string;
    body: string | null;
    landing_url: string;
    attribution: string;
  } | null;
};

/** 편집 화면과 리뷰 화면이 같은 원천 목록을 본다. 한 곳에서 만든다. */
export async function loadLetterSources(
  db: SupabaseClient,
  letterId: string,
): Promise<LoadedSource[]> {
  const withExt = await db
    .from("ds_letter_sources")
    .select(SOURCE_SELECT_EXT)
    .eq("letter_id", letterId);

  // 새 열이 아직 없으면(SQL 실행 전) 옛 열만 읽는다. 이 대비가 없으면 배포 직후
  // 원천 목록이 비어 리뷰의 링크 점검과 승인이 모두 막힌다.
  const data = withExt.error
    ? (await db.from("ds_letter_sources").select(SOURCE_SELECT_BASE).eq("letter_id", letterId)).data
    : withExt.data;

  const rows = (data ?? []) as unknown as SourceRow[];

  return rows.flatMap((r): LoadedSource[] => {
    const tag = r.tag ?? null;
    if (r.paper) {
      return [
        {
          label: SOURCE_LABEL[r.paper.source] ?? r.paper.source,
          title: r.paper.title,
          url: r.paper.landing_url,
          abstract: r.paper.abstract,
          attribution: null,
          licenseLabel: licenseLabel(r.paper.license),
          tag,
          extKind: null,
        },
      ];
    }
    if (r.gov_press) {
      return [
        {
          label: AGENCY_LABEL[r.gov_press.agency] ?? r.gov_press.agency,
          title: r.gov_press.title,
          url: r.gov_press.landing_url,
          abstract: r.gov_press.body,
          attribution: r.gov_press.attribution,
          licenseLabel: "공공누리 제1유형",
          tag,
          extKind: null,
        },
      ];
    }
    if (r.ext_url) {
      return [
        {
          label: EXT_KIND_LABEL[r.ext_source_kind ?? ""] ?? r.ext_source_kind ?? "외부 원천",
          title: r.ext_title ?? r.ext_url,
          url: r.ext_url,
          abstract: null,
          attribution: null,
          licenseLabel: licenseLabel(r.license),
          tag,
          extKind: r.ext_source_kind ?? null,
        },
      ];
    }
    return [];
  });
}

/** 교차 리뷰(④)가 원천 대신 받는 사실 카드 한 장 (D33). */
export type FactCard = {
  tag: string | null;
  kind: string;
  title: string;
  content: string;
  /** 인용할 문장이 없고 메모만 있는 원천. 메모에 적힌 사실만 근거로 인정한다. */
  linkOnly: boolean;
};

/** "2005년 2편 → 2025년 177편". 지난해와 그 20년 전을 잇는다. 값이 없으면 null. */
function curveLine(byYear: Record<string, number | null> | null): string | null {
  if (!byYear) return null;
  const last = new Date().getFullYear() - 1;
  const first = last - 20;
  const b = byYear[String(last)];
  // 20년 전 값이 없으면(최근 11년만 잰 질문) 가장 이른 해를 쓴다.
  const from =
    byYear[String(first)] != null
      ? first
      : Math.min(...Object.keys(byYear).filter((k) => /^\d{4}$/.test(k) && byYear[k] != null).map(Number));
  const a = Number.isFinite(from) ? byYear[String(from)] : null;
  if (a == null || b == null || from >= last) return null;
  return `Europe PMC 연도별 논문 수 · ${from}년 ${a}편 → ${last}년 ${b}편`;
}

/**
 * 글의 원천을 사실 카드로 바꾼다.
 * - 논문 · 보도자료: 초록(또는 본문)
 * - 외부 원천: 질문의 증거 표에서 같은 태그의 사실 문장. link_only 면 메모
 * - 자체 집계(own): 제목 + 질문의 연도별 논문 수 한 줄
 * question_id 가 없는 옛 글은 초록만 넣는다(외부 원천은 내용 없이 제목만).
 */
export async function loadFactCards(
  db: SupabaseClient,
  questionId: string | null,
  sources: LoadedSource[],
): Promise<FactCard[]> {
  // 태그마다 증거 표의 문장 전부(20차 · 한 행에 한 문장). 메모는 link_only 원천의 우리 말이다.
  const facts = new Map<string, string[]>();
  const memos = new Map<string, string>();
  const linkOnly = new Set<string>();
  let byYear: Record<string, number | null> | null = null;
  let papers5y: number | null = null;

  if (questionId) {
    const [ev, q] = await Promise.all([
      db
        .from("ds_question_evidence")
        .select("tag, fact_sentence, note, license, fact_subject, fact_year")
        .eq("question_id", questionId),
      db.from("ds_questions").select("v4_by_year, v1_papers_5y").eq("id", questionId).maybeSingle(),
    ]);
    type EvRow = {
      tag: string | null;
      fact_sentence: string | null;
      note: string | null;
      license: string | null;
      fact_subject?: string | null;
      fact_year?: number | null;
    };
    for (const r of (ev.data ?? []) as EvRow[]) {
      if (!r.tag) continue;
      if (r.license === "link_only") {
        linkOnly.add(r.tag);
        if (r.note) memos.set(r.tag, r.note);
        continue;
      }
      // 대상 · 연도도 카드의 일부다. 초안이 대상 칸을 쓰므로 교차 리뷰도 같이 받아야 한다(20차 실측: 표본 수 오지적 4건).
      const prefix = r.fact_subject || r.fact_year ? `(대상: ${r.fact_subject ?? "-"}${r.fact_year ? ` · ${r.fact_year}` : ""}) ` : "";
      for (const line of (r.fact_sentence ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
        const list = facts.get(r.tag) ?? [];
        if (!list.includes(prefix + line)) list.push(prefix + line);
        facts.set(r.tag, list);
      }
    }
    byYear = (q.data?.v4_by_year as Record<string, number | null> | null) ?? null;
    papers5y = (q.data?.v1_papers_5y as number | null) ?? null;
  }

  return sources.map((s): FactCard => {
    const base = { tag: s.tag, kind: s.label, title: s.title };
    if (s.extKind === "own") {
      // 초안 카드의 [V] 줄과 같은 사실을 준다(21차: "최근 5년" 이 빠져 오지적이 났다).
      const curve = curveLine(byYear);
      const five = papers5y !== null ? ` · 최근 5년 ${papers5y.toLocaleString("ko-KR")}편` : "";
      return { ...base, content: curve ? curve + five : "", linkOnly: false };
    }
    if (s.tag && linkOnly.has(s.tag)) return { ...base, content: memos.get(s.tag) ?? "", linkOnly: true };
    // 질문의 증거 표에 문장이 있으면 그 문장(사실 카드)을 준다. 없으면(옛 글) 초록을 준다.
    const card = s.tag ? facts.get(s.tag) : undefined;
    if (card?.length) return { ...base, content: card.join("\n"), linkOnly: false };
    return { ...base, content: s.extKind ? "" : (s.abstract ?? ""), linkOnly: false };
  });
}

/** 편집기가 저장할 때 쓴다. updated_at 을 항상 같이 올린다. */
export async function saveLetterBody(
  db: SupabaseClient,
  letterId: string,
  patch: { title?: string; summary?: string; blocks?: LetterBlock[] },
) {
  return db
    .from("ds_letters")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", letterId);
}
