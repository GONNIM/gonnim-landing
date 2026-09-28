// /sangsik/l/<slug> · 발행된 글. Storage 의 <slug>.json 을 읽어 메일과 같은 틀(render.ts)로 그린다.
// 새 모양을 만들지 않는다 — 메일과 웹이 갈라지지 않게 한다.

import { letterJsonUrl } from "@/lib/dominance/db";
import { toEmailHtml, type LetterPayload } from "@/lib/dominance/render";

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

  const html = toEmailHtml(payload, { unsubscribeUrl: "https://gonnim.dev/sangsik/unsubscribe" });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
    },
  });
}
