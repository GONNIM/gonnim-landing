// /ingest · Personal Content Ingest UI
// 인증 필수 (Sprint Radar Supabase user)

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { IngestForm } from "./ingest-form";

export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/radar/login?next=/ingest");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/app"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
            >
              ← My Apps
            </Link>
            <Link
              href="/ingest"
              className="text-lg font-semibold tracking-tight"
            >
              Content Ingest
            </Link>
          </div>
          <div className="text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <p className="mb-6 text-sm text-muted-foreground">
          URL 또는 텍스트를 붙여넣고 요약·인사이트를 생성하세요. 확인 후
          Obsidian <code className="rounded bg-[color:var(--muted)]/30 px-1">Clippings/summaries/</code> 에 저장됩니다.
        </p>
        <IngestForm />
      </section>
    </main>
  );
}
