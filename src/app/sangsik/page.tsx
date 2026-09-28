// /sangsik · 최신 발행 글로 보낸다. 발행 글이 없으면 가입 화면으로 보낸다.
import { redirect } from "next/navigation";
import { getDominanceClient } from "@/lib/dominance/db";

export const dynamic = "force-dynamic";

export default async function SangsikHome() {
  const { data } = await getDominanceClient()
    .from("ds_letters")
    .select("slug")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ slug: string }>();

  redirect(data ? `/sangsik/l/${encodeURIComponent(data.slug)}` : "/sangsik/subscribe");
}
