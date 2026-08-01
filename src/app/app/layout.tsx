// /app · My Apps 대시보드 shell
// 인증 필수 · 미로그인 시 /radar/login?next=/app 리다이렉트

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/radar/login?next=/app");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/app" className="text-lg font-semibold tracking-tight">
            🚀 My Apps
          </Link>
          <div className="text-xs text-muted-foreground">
            {user.email} ·{" "}
            <Link href="/" className="underline hover:text-foreground">
              gonnim.dev
            </Link>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
