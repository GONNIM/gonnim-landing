// /sangsik/l/<slug> · 발행된 글. Storage 의 <slug>.json 을 읽어 메일과 같은 틀(render.ts)로 그린다.
// 새 모양을 만들지 않는다 — 메일과 웹이 갈라지지 않게 한다.

import { letterJsonUrl } from "@/lib/dominance/db";
import { reactionLinks } from "@/lib/dominance/reactions";
import { toEmailHtml, type LetterPayload } from "@/lib/dominance/render";
import { signLetterKind } from "@/lib/sangsik/token";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const notFound = () =>
    new Response("<!doctype html><meta charset=utf-8><title>없는 글</title><p>없는 글입니다.</p>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=60" },
    });

  if (!SLUG.test(slug)) return notFound();

  const res = await fetch(letterJsonUrl(slug), { next: { revalidate: 60 } });
  if (!res.ok) return notFound();

  let payload: LetterPayload;
  try {
    payload = (await res.json()) as LetterPayload;
  } catch {
    return notFound();
  }

  // 26차 C-2 · C-3 · 반응 · 투표 링크(r=web)와 끝 도달 신호. 옛 JSON(letterId 없음)에는 붙이지 않는다.
  const id = payload.letterId;
  const html = toEmailHtml(payload, {
    unsubscribeUrl: "https://gonnim.dev/sangsik/unsubscribe",
    ...(id ? { reactions: reactionLinks(id, payload.votes ?? [], "web"), tail: endSignal(id) } : {}),
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
    },
  });
}

/**
 * 끝 도달 신호. 글 맨 아래 표시가 화면에 들어오면 한 번 보낸다. 쿠키 · 식별자 없음.
 * 같은 탭에서 두 번 보내지 않으려고 sessionStorage 에 표시만 둔다(서버로 가지 않는다).
 */
function endSignal(letterId: string): string {
  const body = JSON.stringify(`l=${letterId}&s=${signLetterKind(letterId, "end")}`);
  const key = JSON.stringify(`ds-end-${letterId}`);
  return `<div id="ds-end" style="height:1px"></div><script>(function(){var k=${key};try{if(sessionStorage.getItem(k))return}catch(e){}var el=document.getElementById("ds-end");if(!el||!("IntersectionObserver" in window)||!navigator.sendBeacon)return;var o=new IntersectionObserver(function(es){if(!es.some(function(x){return x.isIntersecting}))return;o.disconnect();try{sessionStorage.setItem(k,"1")}catch(e){}navigator.sendBeacon("/api/sangsik/signal",new Blob([${body}],{type:"application/x-www-form-urlencoded"}))});o.observe(el)})()</script>`;
}
