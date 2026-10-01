// POST /api/sangsik/resend-webhook · Resend 웹훅(email.opened · email.clicked)을 레터별 숫자로 센다 (D42 ① · 26차 C-1).
//
// 서명이 없거나 틀리면 401 이다. 비밀값은 DS_RESEND_WEBHOOK_SECRET(Resend 가 웹훅을 만들 때 준 값).
// 받은 주소(to) · IP · 브라우저 정보는 저장하지 않는다. 브로드캐스트 id 로 레터를 찾고 숫자만 올린다.
// 같은 메일(email_id)의 두 번째 열람, 같은 메일 · 같은 링크의 두 번째 클릭은 해시로 막는다.

import { Resend } from "resend";

import { getDominanceClient } from "@/lib/dominance/db";
import { loadLetterSources } from "@/lib/dominance/letters";
import { bumpReaction, classifyLink, firstTime } from "@/lib/dominance/reactions";
import { dedupeHash } from "@/lib/sangsik/token";

type Event = {
  type?: string;
  data?: { broadcast_id?: string; email_id?: string; click?: { link?: string } };
};

export async function POST(request: Request) {
  const secret = process.env.DS_RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id") ?? request.headers.get("webhook-id");
  const timestamp = request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp");
  const signature = request.headers.get("svix-signature") ?? request.headers.get("webhook-signature");
  const payload = await request.text();
  if (!secret || !id || !timestamp || !signature) return new Response("unauthorized", { status: 401 });

  let event: Event;
  try {
    // verify 는 API 키를 쓰지 않는다. 서명 · 시각(5분)만 본다.
    event = new Resend(process.env.RESEND_API_KEY ?? "re_unused").webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    }) as Event;
  } catch {
    return new Response("unauthorized", { status: 401 });
  }

  if (event.type !== "email.opened" && event.type !== "email.clicked") return Response.json({ ok: true, skipped: event.type });
  const broadcastId = event.data?.broadcast_id;
  const emailId = event.data?.email_id;
  if (!broadcastId || !emailId) return Response.json({ ok: true, skipped: "broadcast 아님" });

  const db = getDominanceClient();
  const { data: letter } = await db.from("ds_letters").select("id").eq("resend_broadcast_id", broadcastId).maybeSingle();
  if (!letter) return Response.json({ ok: true, skipped: "레터 없음" });
  const letterId = (letter as { id: string }).id;

  try {
    if (event.type === "email.opened") {
      if (await firstTime(db, letterId, "open", dedupeHash(letterId, "open", emailId))) await bumpReaction(db, letterId, { opens: 1 });
      return Response.json({ ok: true });
    }
    const link = event.data?.click?.link ?? "";
    if (!(await firstTime(db, letterId, "click", dedupeHash(letterId, "click", emailId, link)))) return Response.json({ ok: true, duplicate: true });
    const sources = await loadLetterSources(db, letterId);
    const kind = classifyLink(link, sources.map((s) => s.url));
    await bumpReaction(db, letterId, { clicks: 1, clickKind: kind });
    return Response.json({ ok: true, kind });
  } catch (err) {
    // 500 이면 Resend 가 다시 보낸다. 해시가 들어간 뒤 숫자 올리기에서 실패했다면 다시 온 것은
    // 중복으로 걸러져 그 한 건이 빠진다. 두 번 세는 것보다 덜 세는 쪽을 택했다.
    console.error("sangsik webhook", err instanceof Error ? err.message : err);
    return new Response("error", { status: 500 });
  }
}
