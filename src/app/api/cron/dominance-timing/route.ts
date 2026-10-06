// 56차 D · 화면 자료 읽기와 저장 동작의 단계별 시간을 잰다(배포에서 재기 위한 통로).
//
//   GET /api/cron/dominance-timing?what=overview|questions|schedule
//   GET /api/cron/dominance-timing?what=evidence&id={질문 id}
//   GET /api/cron/dominance-timing?what=editor|review&id={글 id}
//   GET /api/cron/dominance-timing?what=save&id={쓰는 중 글 id}       지금 본문을 그대로 다시 저장한다(내용 변화 없음)
//   GET /api/cron/dominance-timing?what=meaning&id={질문 id}          쓰인 문장 중 미확인 뜻 하나를 지금 글자 그대로 미확인으로 다시 저장한다
//
// Authorization: Bearer CRON_SECRET 이 맞아야 한다(값이 없으면 모두 거부). 화면과 같은 함수(page-data.ts · letter-save.ts)를 부른다.
// 로그인(인증) 시간과 화면 그리기 시간은 들어 있지 않다. 응답: JSON { what, total, marks } · Server-Timing 헤더.

import type { NextRequest } from "next/server";
import { getDominanceClient } from "@/lib/dominance/db";
import { timer } from "@/lib/dominance/timing";
import { loadEditorPage, loadEvidencePage, loadOverview, loadQuestionsPage, loadReviewPage, loadSchedulePage } from "@/lib/dominance/page-data";
import { saveLetterCore } from "@/lib/dominance/letter-save";
import { loadQuestionCard, usedFacts } from "@/lib/dominance/card";
import { setFactKo } from "@/lib/dominance/evidence";
import { kstToday } from "@/lib/dominance/kst";
import type { LetterBlock } from "@/lib/dominance/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const what = req.nextUrl.searchParams.get("what") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const db = getDominanceClient();
  const t = timer(`재기 · ${what}`);
  let note = "";

  switch (what) {
    case "overview":
      await loadOverview(db, t);
      break;
    case "questions":
      await loadQuestionsPage(db, t);
      break;
    case "evidence":
      await loadEvidencePage(db, id, t);
      break;
    case "editor":
      await loadEditorPage(db, id, t);
      break;
    case "review":
      await loadReviewPage(db, id, t);
      break;
    case "schedule": {
      const month = kstToday().slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      await loadSchedulePage(db, { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` }, t);
      break;
    }
    case "save": {
      const { data } = await db.from("ds_letters").select("title, summary, blocks, status").eq("id", id).maybeSingle<{ title: string; summary: string | null; blocks: LetterBlock[]; status: string }>();
      if (!data || data.status !== "draft") return Response.json({ error: "쓰는 중 글만 잽니다" }, { status: 400 });
      const r = await saveLetterCore(db, id, { title: data.title, summary: data.summary ?? "", blocks: data.blocks }, t);
      note = r.error ?? "같은 본문 다시 저장";
      break;
    }
    case "meaning": {
      const { data: letter } = await db.from("ds_letters").select("blocks").eq("question_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ blocks: { text: string }[] }>();
      const card = await loadQuestionCard(db, id);
      const f = card && letter ? usedFacts(card, letter.blocks).find((x) => !x.koVerifiedAt && x.ko?.trim()) : undefined;
      if (!f) return Response.json({ error: "미확인 뜻이 있는 쓰인 문장이 없습니다" }, { status: 400 });
      const [rowId, line] = f.id.split(":");
      await t.step("뜻 저장", setFactKo(db, rowId, Number(line), f.ko!, false));
      note = `미확인 뜻 그대로 다시 저장 · ${f.id}`;
      break;
    }
    default:
      return Response.json({ error: "what 을 고르십시오" }, { status: 400 });
  }

  t.log(note);
  return Response.json(
    { what, id: id || null, total: t.total(), marks: t.marks(), note: note || null },
    { headers: { "Server-Timing": t.header(), "Cache-Control": "no-store" } },
  );
}
