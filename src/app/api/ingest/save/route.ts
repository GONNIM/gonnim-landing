// Content Ingest · Obsidian 저장 API
//
// POST body: { content: ExtractedContent, summary: SummarizeResult }
// 인증 필수. 로컬 dev 전용 (Vercel 서버리스 fs 접근 불가) — INGEST_CLIPPINGS_DIR 미설정·에러 시 503.

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import { saveClipping } from "@/lib/content-ingest/save-clipping";
import type {
  ExtractedContent,
  SummarizeResult,
} from "@/lib/content-ingest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { content?: ExtractedContent; summary?: SummarizeResult };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!body.content || !body.summary) {
    return NextResponse.json(
      { error: "content, summary 필수" },
      { status: 400 },
    );
  }

  try {
    const saved = await saveClipping(body.content, body.summary);
    return NextResponse.json({ saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      /ENOENT|EACCES|EROFS/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
