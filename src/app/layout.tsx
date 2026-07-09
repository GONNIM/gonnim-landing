import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gonnim.dev"),
  title: {
    default: "홍해연 · 22년차 풀사이클 시니어 엔지니어 · AI/RAG 실전",
    template: "%s · gonnim.dev",
  },
  description:
    "연 80억 원가 절감 · SKT BMT 20,000 대리점 · AI 응답 정확도 25% ↑. 22년 풀사이클 시니어 엔지니어가 만드는, 회사 데이터가 밖으로 나가지 않는 로컬 AI.",
  keywords: [
    "홍해연",
    "gonnim",
    "AI 홍변",
    "Pocket RAG",
    "Local LLM",
    "RAG",
    "Ollama",
    "Next.js",
    "시니어 엔지니어",
    "VPE",
    "Tech Director",
  ],
  authors: [{ name: "홍해연", url: "https://gonnim.dev" }],
  creator: "홍해연",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://gonnim.dev",
    siteName: "gonnim.dev",
    title: "홍해연 · 22년차 풀사이클 시니어 엔지니어 · AI/RAG 실전",
    description:
      "연 80억 원가 절감 · SKT BMT 20,000 대리점 · AI 응답 정확도 25% ↑. 회사 데이터가 밖으로 나가지 않는 로컬 AI, 22년차 시니어 엔지니어가 만듭니다.",
  },
  twitter: {
    card: "summary_large_image",
    title: "홍해연 · 22년차 풀사이클 시니어 엔지니어",
    description:
      "연 80억 원가 절감 · SKT BMT 20,000 대리점 · AI 응답 정확도 25% ↑",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:inline-flex focus:h-10 focus:items-center focus:rounded-full focus:bg-[color:var(--color-accent)] focus:px-5 focus:text-sm focus:font-semibold focus:text-[color:var(--color-accent-foreground)] focus:shadow-lg"
        >
          본문으로 건너뛰기
        </a>
        <Header />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
