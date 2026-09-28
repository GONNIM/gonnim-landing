// 지배상식 공개면(D38). 랜딩의 머리 · 꼬리를 쓰지 않는다(루트 레이아웃이 /sangsik 에서 숨긴다).
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "지배상식", template: "%s · 지배상식" },
  description: "주 3회, 질문 하나씩, 우리가 답을 쓴다. 연구 · 보건 레터.",
};

export default function SangsikLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#1f2328]">
      <div className="mx-auto max-w-[620px] px-5 py-10">
        <Link href="/sangsik" className="text-sm text-[#6b7280] no-underline">
          지배상식
        </Link>
        <main className="mt-6 rounded-lg bg-white px-6 py-8 shadow-sm">{children}</main>
        <footer className="mt-6 space-x-3 text-xs text-[#9ca3af]">
          <Link href="/sangsik/privacy" className="underline">개인정보 처리 방침</Link>
          <Link href="/sangsik/unsubscribe" className="underline">수신거부</Link>
          <span>문의 hi@gonnim.dev</span>
        </footer>
      </div>
    </div>
  );
}
