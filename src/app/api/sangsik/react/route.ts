// /api/sangsik/react · 반응 3개(몰랐다 · 알고 있었다 · 더 알고 싶다)와 다음 질문 투표 (D42 ③④ · 26차 C-3).
//
// 링크: ?l=<레터 id>&k=<react:new | vote:<질문 id>>&s=<레터 몫 서명>&r=<구독자 토큰 | web>
// - 구독자 토큰(r)은 Resend 연락처 속성 ds_rk 다. 메일마다 사람에 맞게 바뀌어 들어간다.
// - 서버는 레터별 숫자만 올린다. 같은 사람의 두 번째 반응(또는 투표)은 HMAC 해시로 막는다.
// - 웹 페이지 하단 링크는 r=web 이다. 사람을 모르므로 중복을 막지 못하고, IP 당 분당 횟수만 막는다(IP 는 저장하지 않는다).
//
// GET 은 세지 않는다. 메일 보안 검사기가 링크를 미리 열어도 숫자가 오르지 않게,
// GET 은 스스로 제출되는 작은 양식을 돌려주고 POST 에서 센다.

import { getDominanceClient } from "@/lib/dominance/db";
import { bumpReaction, firstTime, REACT_KINDS, type ReactKind } from "@/lib/dominance/reactions";
import { clientIp, rateLimited } from "@/lib/sangsik/rate-limit";
import { dedupeHash, verifyLetterKind, verifyLink } from "@/lib/sangsik/token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Parsed = { letterId: string; kind: string; sig: string; reader: string };

function parse(sp: URLSearchParams): Parsed | null {
  const letterId = sp.get("l") ?? "";
  const kind = sp.get("k") ?? "";
  const sig = sp.get("s") ?? "";
  const reader = sp.get("r") ?? "web";
  if (!UUID.test(letterId)) return null;
  const ok =
    REACT_KINDS.some((k) => kind === `react:${k}`) || (kind.startsWith("vote:") && UUID.test(kind.slice(5)));
  if (!ok || !verifyLetterKind(letterId, kind, sig)) return null;
  return { letterId, kind, sig, reader };
}

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>지배상식</title></head><body style="margin:0;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#1f2328;text-align:center">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const THANKS = () => page(`<p style="font-size:17px">고맙습니다.</p>`);
const BAD = () => page(`<p style="font-size:15px">링크가 올바르지 않습니다.</p>`, 400);

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!parse(url.searchParams)) return BAD();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const fields = ["l", "k", "s", "r"]
    .map((n) => `<input type="hidden" name="${n}" value="${esc(url.searchParams.get(n) ?? "")}">`)
    .join("");
  return page(
    `<form id="f" method="post" action="/api/sangsik/react">${fields}<noscript><button style="font-size:16px;padding:8px 16px">보내기</button></noscript></form><script>document.getElementById("f").submit()</script>`,
  );
}

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return BAD();
  }
  const p = parse(form);
  if (!p) return BAD();

  const db = getDominanceClient();
  const group = p.kind.startsWith("vote:") ? "vote" : "react";
  try {
    if (p.reader === "web") {
      if (rateLimited(`react:${clientIp(request.headers) ?? "unknown"}`, 3)) return THANKS();
    } else {
      const v = verifyLink(p.reader, "react");
      if (!v.ok) return BAD();
      // 한 사람은 한 레터에 반응 하나 · 투표 하나
      if (!(await firstTime(db, p.letterId, group, dedupeHash(p.letterId, group, v.id)))) return THANKS();
    }
    if (group === "vote") await bumpReaction(db, p.letterId, { vote: p.kind.slice(5) });
    else await bumpReaction(db, p.letterId, { react: p.kind.slice(6) as ReactKind });
  } catch (err) {
    console.error("sangsik react", err instanceof Error ? err.message : err);
  }
  return THANKS();
}
