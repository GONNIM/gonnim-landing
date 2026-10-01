import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보 처리 방침" };

export default function PrivacyPage() {
  return (
    <article className="space-y-5 text-[15px] leading-7">
      <h1 className="text-2xl font-bold">개인정보 처리 방침</h1>
      <p className="text-sm text-[#6b7280]">시행 2026-09-28 · 개정 2026-10-01(레터별 통계 절 추가) · 지배상식 (gonnim.dev/sangsik)</p>

      <section>
        <h2 className="font-semibold">수집하는 항목</h2>
        <p>이메일 주소 하나입니다. 가입 시각, 확인 시각, 가입할 때의 접속 IP 주소를 함께 기록합니다(부정 가입 확인용).</p>
      </section>
      <section>
        <h2 className="font-semibold">쓰는 목적</h2>
        <p>레터 발송과 아래의 레터별 통계 집계에만 씁니다. 광고, 판매, 다른 서비스 안내에 쓰지 않습니다.</p>
      </section>
      <section>
        <h2 className="font-semibold">레터별 통계</h2>
        <p>
          메일 열람 · 링크 클릭 · 글 끝 도달 · 반응 버튼 · 다음 질문 투표를 레터별 숫자로만 집계합니다. 누가 눌렀는지는
          저장하지 않습니다. 같은 사람의 중복만 막기 위해 되돌릴 수 없는 해시를 둡니다. 메일 열람 확인에는 작은 그림이
          쓰입니다.
        </p>
      </section>
      <section>
        <h2 className="font-semibold">보관 기간</h2>
        <p>
          구독하는 동안 보관합니다. 수신거부 뒤 30일 안에 삭제하거나 누구인지 알 수 없게 바꿀 <strong>예정</strong>입니다.
          지금은 수신거부 시각을 기록해 다시 보내지 않도록 막고 있으며, 30일 뒤 자동 삭제는 아직 만들지 않았습니다.
        </p>
      </section>
      <section>
        <h2 className="font-semibold">처리를 맡기는 곳</h2>
        <p>메일 발송은 Resend, 데이터 보관은 Supabase 에 맡깁니다. 두 곳 모두 이 목적 안에서만 처리합니다.</p>
      </section>
      <section>
        <h2 className="font-semibold">수신거부 · 삭제 요청</h2>
        <p>
          레터 하단의 수신거부 링크를 한 번 누르면 바로 끝납니다. 링크가 없으면{" "}
          <a href="/sangsik/unsubscribe" className="underline">수신거부 화면</a>에서 이메일을 넣으시면 링크를 보내 드립니다.
          삭제를 원하시면 아래 주소로 알려 주십시오.
        </p>
      </section>
      <section>
        <h2 className="font-semibold">연락처</h2>
        <p>hi@gonnim.dev</p>
      </section>

      <p className="border-t border-[#e5e7eb] pt-4 text-sm text-[#6b7280]">
        이 문서는 관련 법 조문을 대조해 확인하지 않은 초안입니다. 운영자가 검토합니다.
      </p>
    </article>
  );
}
