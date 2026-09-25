// 지배상식 운용 콘솔 shell · radar/layout.tsx 와 같은 패턴.

import Link from "next/link";
import { requireDominanceAdmin } from "@/lib/dominance/guard";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dominance", label: "현황" },
  { href: "/dominance/candidates", label: "① 이슈" },
  { href: "/dominance/letters", label: "③ 글" },
  { href: "/dominance/review", label: "④ 리뷰" },
  { href: "/dominance/schedule", label: "⑤ 발행일" },
  { href: "/dominance/subscribers", label: "구독자" },
  { href: "/dominance/runs", label: "크론 기록" },
];

export default async function DominanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireDominanceAdmin();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/app"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
            >
              ← My Apps
            </Link>
            <Link href="/dominance" className="text-lg font-semibold tracking-tight">
              지배상식
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground/85 hover:border-[color:var(--accent)] hover:text-foreground"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </main>
  );
}
