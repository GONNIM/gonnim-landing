// 59차 C · 「기록」 상세 · 제목 · 한 문장 요약 · 7블록 본문(읽기 전용 · 태그 포함) · 원천 목록 · 감사 기록 시간표.
// 자료는 letterPackage 한 곳에서 읽는다. 60차 B · 머리 아래 「변환」 절에서 블로그 글 · 쇼츠 대본을 만든다.

import Link from "next/link";
import { notFound } from "next/navigation";
import { dominanceContext } from "@/lib/dominance/guard";
import { formatKstDate, formatKstDateTime } from "@/lib/dominance/kst";
import { letterPackage } from "@/lib/dominance/letter-package";
import { listConversions } from "@/lib/dominance/convert";
import { ConvertPanel } from "./ConvertPanel";
import { LETTER_STATUS_LABEL } from "@/lib/dominance/types";

export const dynamic = "force-dynamic";
// 쇼츠 대본은 Anthropic → OpenAI → GLM 순서로 한두 번 부른다(62차)
export const maxDuration = 300;

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await dominanceContext();
  const pkg = await letterPackage(db, id);
  if (!pkg) notFound();
  const conversions = await listConversions(db, id);

  const dates: [string, string][] = [
    ["발행일", formatKstDate(pkg.dates.scheduledFor)],
    ["작성 완료", pkg.dates.finished ? formatKstDateTime(pkg.dates.finished) : "기록 없음"],
    ["리뷰 통과", formatKstDateTime(pkg.dates.reviewed)],
    ["승인", `${formatKstDateTime(pkg.dates.approved)}${pkg.approvedKind ? ` · ${pkg.approvedKind}` : ""}`],
    ["발송", pkg.status === "published" ? `${formatKstDateTime(pkg.dates.sent ?? pkg.dates.published)} · 받는 수 ${pkg.sentCount ?? 0}` : "—"],
  ];

  return (
    <div className="space-y-6">
      <Link href="/dominance/history" className="text-xs text-muted-foreground hover:text-foreground">
        ◀ 기록
      </Link>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">{LETTER_STATUS_LABEL[pkg.status]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{pkg.title}</h1>
        {pkg.summary && <p className="text-sm text-foreground/85">{pkg.summary}</p>}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {dates.map(([k, v]) => (
            <div key={k}>
              <dt className="inline">{k} </dt>
              <dd className="inline text-foreground/85">{v}</dd>
            </div>
          ))}
          {pkg.webUrl && (
            <a href={pkg.webUrl} target="_blank" rel="noreferrer" className="underline">
              웹 글 ↗
            </a>
          )}
        </dl>
      </section>

      <ConvertPanel letterId={pkg.id} initial={conversions} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">본문</h2>
        {pkg.blocks.map((b) => (
          <div key={b.kind} className="rounded-xl border border-[color:var(--border)]/70 bg-surface/30 p-4">
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{b.text || "(비어 있음)"}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">원천 {pkg.sources.length}개</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[color:var(--border)]">
                <th className="py-2 pr-3">태그</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2 pr-3">제목</th>
                <th className="py-2 pr-3">라이선스</th>
              </tr>
            </thead>
            <tbody>
              {pkg.sources.map((s, i) => (
                <tr key={`${s.tag}-${i}`} className="border-b border-[color:var(--border)]/50 align-top">
                  <td className="py-2 pr-3 font-mono">{s.tag ? `[${s.tag}]` : "—"}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{s.kind}</td>
                  <td className="py-2 pr-3">
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                      {s.title}
                    </a>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{s.license || "링크만"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">감사 기록</h2>
        {pkg.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
        ) : (
          <ol className="space-y-1.5 text-xs">
            {pkg.audit.map((a, i) => (
              <li key={i} className="flex flex-wrap gap-x-3">
                <span className="w-28 shrink-0 text-muted-foreground">{formatKstDateTime(a.at)}</span>
                <span className="font-medium text-foreground">{a.label}</span>
                {a.passed === false && <span className="text-amber-700 dark:text-amber-300">통과 못 함</span>}
                {a.model && <span className="text-muted-foreground">{a.model}</span>}
                {a.note && <span className="text-muted-foreground">{a.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
