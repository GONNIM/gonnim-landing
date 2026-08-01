// Content Ingest · 요약 API (Web UI 용)
//
// POST body: { url?: string, text?: string }
// 인증 필수 (Sprint Radar Supabase user)
// 반환: { content: ExtractedContent, summary: SummarizeResult }
//
// 저장은 별도 엔드포인트 (/api/ingest/save) 로 · 사용자가 결과 확인 후 저장 결정.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { extractFromText, extractFromUrl } from "@/lib/content-ingest/extract";
import { summarize } from "@/lib/content-ingest/summarize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!url && !text) {
    return NextResponse.json(
      { error: "url 또는 text 하나는 필수" },
      { status: 400 },
    );
  }

  try {
    const content = url ? await extractFromUrl(url) : extractFromText(text);
    const summary = await summarize(content);
    return NextResponse.json({ content, summary });
  } catch (err) {
    const status =
      typeof err === "object" && err && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status });
  }
}
