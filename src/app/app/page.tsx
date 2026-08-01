// /app · My Apps 대시보드
// APPS 레지스트리 순회 · 카드 그리드 자동 렌더

import Link from "next/link";
import { APPS, STATUS_LABEL, STATUS_STYLE } from "@/lib/apps";

export const dynamic = "force-dynamic";

export default function AppsDashboard() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          개인 앱 진입점 · gonnim.dev 하위 인증 앱 목록
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => (
          <Link
            key={app.id}
            href={app.href}
            className="group flex flex-col rounded-lg border border-[color:var(--border)]/60 bg-[color:var(--card)] p-5 transition hover:border-[color:var(--foreground)]/40 hover:bg-[color:var(--muted)]/10"
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="text-3xl" aria-hidden>
                {app.emoji}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLE[app.status]}`}
              >
                {STATUS_LABEL[app.status]}
              </span>
            </div>
            <h2 className="text-base font-semibold group-hover:underline">
              {app.label}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {app.description}
            </p>
            <div className="mt-4 text-[11px] font-mono text-muted-foreground">
              {app.href} →
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        신규 앱 추가: <code>src/lib/apps.ts</code> 에 항목 추가 시 자동 노출.
      </p>
    </section>
  );
}
