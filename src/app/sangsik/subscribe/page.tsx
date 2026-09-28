import type { Metadata } from "next";
import { EmailForm } from "../EmailForm";

export const metadata: Metadata = { title: "구독" };

export default function SubscribePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold leading-9">지배상식 구독</h1>
      <p className="text-[15px] leading-7 text-[#374151]">
        주 3회, 질문 하나씩, 우리가 답을 씁니다. 연구 · 보건 레터입니다. 발행일 아침 7시에 메일로 갑니다.
      </p>
      <EmailForm
        endpoint="/api/sangsik/subscribe"
        withConsent
        submitLabel="구독 신청"
        doneMessage="확인 메일을 보냈습니다. 메일의 링크를 눌러야 구독이 시작됩니다."
      />
    </div>
  );
}
