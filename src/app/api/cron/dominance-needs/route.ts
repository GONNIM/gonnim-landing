// ⓪-0 Needs 지도 크론 · 하루 1회 (vercel.json "30 22 * * *" UTC = 07:30 KST · 지배상식 크론 뒤).
//
// 매일: 위키백과 상위 문서의 설명 캐시를 시간 예산(240초) 안에서 채운다.
// 월요일(KST): 그 주의 파일 ds-drafts/needs/<주 시작일>.json 을 쓴다(D41 · 36차 C).
// 기존 지배상식 크론에 넣지 않은 이유: 한 주의 새 문서 설명 약 2,600개를 받는 데 400초 넘게 걸려
// 40초 기준을 넘는다(36차 실측). 이 경로는 발행 · 발송과 섞이지 않는다.

import type { NextRequest } from "next/server";
import { getDominanceClient } from "@/lib/dominance/db";
import { collectNeeds, kstDate } from "@/lib/dominance/needs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const monday = new Date(`${kstDate(now)}T00:00:00Z`).getUTCDay() === 1;
  const force = new URL(req.url).searchParams.get("week") === "1";
  try {
    const w = await collectNeeds(getDominanceClient(), now, { budgetMs: 240_000, writeWeek: monday || force });
    return Response.json({
      ok: true,
      wroteWeek: monday || force,
      weekStart: w.weekStart,
      ms: w.ms,
      calls: w.calls,
      descMissing: w.descMissing,
      items: w.items.length,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
