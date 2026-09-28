import type { Metadata } from "next";
import Link from "next/link";
import { getDominanceClient } from "@/lib/dominance/db";
import { confirmSubscription } from "@/lib/sangsik/subscribers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "구독 확인", robots: { index: false } };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const outcome = await confirmSubscription(getDominanceClient(), t);

  const unsubscribeNote = (
    <p className="text-sm leading-6 text-[#6b7280]">
      그만 받고 싶으면 레터 하단의 수신거부 링크를 누르거나{" "}
      <Link href="/sangsik/unsubscribe" className="underline">수신거부 화면</Link>을 쓰시면 됩니다.
    </p>
  );

  if (outcome === "confirmed" || outcome === "already") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{outcome === "confirmed" ? "구독이 시작됐습니다" : "이미 구독 중입니다"}</h1>
        {outcome === "confirmed" && (
          <p className="text-[15px] leading-7">다음 레터는 발행일 아침 7시에 갑니다.</p>
        )}
        {unsubscribeNote}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{outcome === "expired" ? "확인 링크가 만료됐습니다" : "확인 링크가 올바르지 않습니다"}</h1>
      <p className="text-[15px] leading-7">
        <Link href="/sangsik/subscribe" className="underline">구독 화면</Link>에서 다시 신청하시면 새 확인 메일이 갑니다.
      </p>
    </div>
  );
}
