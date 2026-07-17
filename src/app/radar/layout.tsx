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
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-40 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/radar"
              className="text-lg font-semibold tracking-tight"
            >
              Sprint Radar
            </Link>
            {user && (
              <nav className="flex items-center gap-4 text-sm text-neutral-400">
                <Link href="/radar" className="hover:text-neutral-100">
                  대시보드
                </Link>
                <Link
                  href="/radar/projects"
                  className="hover:text-neutral-100"
                >
                  프로젝트
                </Link>
                <Link
                  href="/radar/analytics"
                  className="hover:text-neutral-100"
                >
                  분석
                </Link>
              </nav>
            )}
          </div>
          <div className="text-sm text-neutral-400">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline">{user.email}</span>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
                  >
                    로그아웃
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/radar/login"
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:border-neutral-500"
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
