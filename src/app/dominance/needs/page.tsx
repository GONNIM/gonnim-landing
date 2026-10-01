// ⓪-0 Needs 지도 (D41 · 36차 C) · 10개 영역 × 신호. 지금은 위키백과 두 칸이 차 있고, 네이버 두 칸은 키를 기다린다(런북 9).
//
// 신호는 질문을 대신 정하지 않는다. 운영자가 보고 [이 신호로 이슈 만들기] 로 ⓪-1 에 넘긴다. 질문 문장은 운영자가 쓴다.

import Link from "next/link";
import { dominanceContext } from "@/lib/dominance/guard";
import { AREAS10, UNCLASSIFIED, loadLatestNeeds, type NeedsItem } from "@/lib/dominance/needs";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("ko-KR");

function signalHref(x: NeedsItem, weekStart: string): string {
  const signal = { src: `wiki-${x.lang}`, title: x.title, views: x.views7, delta: x.delta, week: weekStart };
  return `/dominance/questions?signal=${encodeURIComponent(JSON.stringify(signal))}`;
}

function Docs({ list, weekStart }: { list: NeedsItem[]; weekStart: string }) {
  if (!list.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <ul className="space-y-1.5">
      {list.map((x) => (
        <li key={`${x.lang}:${x.title}`} className="text-xs leading-snug">
          <a
            href={`https://${x.lang}.wikipedia.org/wiki/${encodeURIComponent(x.title)}`}
            target="_blank"
            rel="noreferrer"
            className="text-foreground/90 hover:underline"
          >
            {x.title.replace(/_/g, " ")}
          </a>
          <span className="ml-1 text-muted-foreground">
            {fmt(x.views7)}
            {x.delta === null ? " · 첫 주" : ` · ${x.delta >= 0 ? "+" : ""}${fmt(x.delta)}`}
          </span>
          <Link href={signalHref(x, weekStart)} className="ml-1.5 whitespace-nowrap text-[11px] text-[color:var(--accent)] hover:underline">
            [이 신호로 이슈 만들기]
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function NeedsPage() {
  const { db } = await dominanceContext();
  const week = await loadLatestNeeds(db);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">⓪-0 Needs 지도</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          독자가 무엇을 찾아보는지 영역별로 봅니다. 신호를 보고 질문은 직접 씁니다(D41). 순서는 사람이 정합니다(D39).
        </p>
        {week ? (
          <p className="mt-2 text-xs text-muted-foreground">
            주 시작 {week.weekStart} · 위키백과 {week.days[0]} ~ {week.days.at(-1)} 7일 합산 · 과학 · 건강 문서 {week.items.length}개 ·
            수집 {week.collectedAt.slice(0, 16).replace("T", " ")}(UTC){week.firstWeek ? " · 첫 주(증감 없음)" : ""}
            {week.descMissing ? ` · 설명을 못 받은 문서 ${week.descMissing}개는 빠짐` : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-300">아직 수집한 주가 없습니다. 월요일 07:30(KST) 크론이 첫 주를 만듭니다.</p>
        )}
      </section>

      {week && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[color:var(--border)]">
                <th className="w-28 py-2 pr-3">영역</th>
                <th className="py-2 pr-3">위키 ko 상위 5(7일 조회 · 증감)</th>
                <th className="py-2 pr-3">위키 en 상위 5</th>
                <th className="w-36 py-2 pr-3">네이버 검색 추세</th>
                <th className="w-36 py-2 pr-3">지식iN 최신 질문</th>
              </tr>
            </thead>
            <tbody>
              {[...AREAS10, UNCLASSIFIED].map((area) => {
                const of = (lang: "ko" | "en") => week.items.filter((x) => x.lang === lang && x.area === area).slice(0, 5);
                return (
                  <tr key={area} className={`border-b border-[color:var(--border)]/50 align-top ${area === UNCLASSIFIED ? "bg-amber-500/5" : ""}`}>
                    <td className="py-2 pr-3 font-medium">
                      {area}
                      {area === UNCLASSIFIED && (
                        <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">영역 규칙에 맞지 않은 과학 · 건강 문서. 규칙의 빈틈을 봅니다</span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><Docs list={of("ko")} weekStart={week.weekStart} /></td>
                    <td className="py-2 pr-3"><Docs list={of("en")} weekStart={week.weekStart} /></td>
                    <td className="py-2 pr-3 text-muted-foreground">키 대기(런북 9)</td>
                    <td className="py-2 pr-3 text-muted-foreground">키 대기 · 화면 표시만(저장 안 함)</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
