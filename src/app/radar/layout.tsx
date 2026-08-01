// Radar layout · minimal shell for authenticated user experience.

import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";

export const dynamic = "force-dynamic";

export default async function RadarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/70/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            {user && (
              <Link
                href="/app"
                className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
              >
                ← My Apps
              </Link>
            )}
            <Link
              href="/radar"
              className="text-lg font-semibold tracking-tight"
            >
              Sprint Radar
            </Link>
            {user && (
              <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link href="/radar" className="hover:text-foreground">
                  대시보드
                </Link>
                <Link
                  href="/radar/projects"
                  className="hover:text-foreground"
                >
                  프로젝트
                </Link>
                <Link
                  href="/radar/business-ideas"
                  className="hover:text-foreground"
                >
                  🎯 사업 아이템
                </Link>
                <Link
                  href="/radar/insights"
                  className="hover:text-foreground"
                >
                  🔍 인사이트
                </Link>
                <Link
                  href="/radar/analytics"
                  className="hover:text-foreground"
                >
                  분석
                </Link>
              </nav>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {user ? (
              <div className="flex items-center gap-4">
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
            ) : (
              <Link
                href="/radar/login"
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs hover:border-[color:var(--accent)]"
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </main>
  );
}
