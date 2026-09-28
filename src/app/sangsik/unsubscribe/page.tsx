import type { Metadata } from "next";
import Link from "next/link";
import { getDominanceClient } from "@/lib/dominance/db";
import { unsubscribeByToken } from "@/lib/sangsik/subscribers";
import { EmailForm } from "../EmailForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "수신거부", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;

  if (t) {
    // 한 번 누르면 끝난다. 확인 단계를 두지 않는다.
    const outcome = await unsubscribeByToken(getDominanceClient(), t);
    if (outcome === "invalid") {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">수신거부 링크가 올바르지 않습니다</h1>
          <p className="text-[15px] leading-7">
            <Link href="/sangsik/unsubscribe" className="underline">수신거부 화면</Link>에서 이메일을 넣으시면 새 링크를 보내 드립니다.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">수신거부되었습니다</h1>
        <p className="text-[15px] leading-7">더는 레터가 가지 않습니다. 다시 받고 싶으면 <Link href="/sangsik/subscribe" className="underline">구독 화면</Link>에서 신청하시면 됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">수신거부</h1>
      <p className="text-[15px] leading-7 text-[#374151]">
        구독한 이메일 주소를 넣으시면 수신거부 링크를 메일로 보내 드립니다. 링크를 한 번 누르면 바로 끝납니다.
      </p>
      <EmailForm
        endpoint="/api/sangsik/unsubscribe"
        withConsent={false}
        submitLabel="수신거부 링크 받기"
        doneMessage="입력하신 주소가 구독 중이라면 수신거부 링크를 보냈습니다. 메일함을 확인해 주십시오."
      />
    </div>
  );
}
