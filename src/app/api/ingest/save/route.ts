// Content Ingest · Obsidian 저장 API
//
// POST body: { content: ExtractedContent, summary: SummarizeResult }
// 인증 필수.
//
// 환경별 동작:
// - 로컬 dev (VERCEL != "1"): fs.writeFile 로 Clippings/summaries/ 파일 생성 (mode=saved)
// - Vercel 프로덕션 (VERCEL === "1"): fs 쓰기 불가 → markdown 응답 (mode=download) · 클라이언트가 다운로드 트리거

import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import {
  renderClipping,
  saveClipping,
} from "@/lib/content-ingest/save-clipping";
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

  const isVercel = process.env.VERCEL === "1";

  if (isVercel) {
    const rendered = renderClipping(body.content, body.summary);
    return NextResponse.json({
      mode: "download",
      filename: rendered.filename,
      markdown: rendered.markdown,
      createdAt: rendered.createdAt,
      suggestedFolder: rendered.suggestedFolder,
    });
  }

  try {
    const saved = await saveClipping(body.content, body.summary);
    return NextResponse.json({ mode: "saved", saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /ENOENT|EACCES|EROFS/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
