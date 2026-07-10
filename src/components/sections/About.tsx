import { AboutCard, type AboutCardProps } from "@/components/AboutCard";

const HIGHLIGHTS = [
  "삼성전자 · LS전선 검사시스템 (연 80억 절감)",
  "SKT · SK플래닛 실사 통과 (20,000 대리점 서비스)",
  "한국마사회 iOS 3년 유지 (안정성 99.9%)",
  "유저커넥트 InterviewX Local LLM 구축 (정확도 25% 향상)",
  "정부과제 4건 풀사이클 · TTA 인증 · 3억 투자유치",
];

const STRENGTHS: AboutCardProps[] = [
  {
    index: "1",
    title: "Reverse Engineering & Protocol",
    detail:
      "800+ 휴대폰 기종 프로토콜 역공학 (ZIBOX Data Manager). Modem 800 · USB 200 · Disk 100 · ADB 500.",
    outcome: "닫힌 시스템 · 레거시 데이터를 AI 로 연결",
  },
  {
    index: "2",
    title: "B2B Hardware & Domain 통합",
    detail:
      "머신비전 · 웨어러블 IoT · 동시통역 시스템. 정부과제 4건 · TTA 인증.",
    outcome: "물리 세계 데이터 ↔ AI 서버 매끄러운 아키텍처",
  },
  {
    index: "3",
    title: "AI 실전 (Local LLM + RAG)",
    detail:
      "Ubuntu + NVIDIA GPU 에 Llama3 배포 + RAG 파인튜닝. InterviewX 정확도 25% 향상.",
    outcome: "단순 API 사용자가 아닌 실전형 AI 엔지니어링",
  },
  {
    index: "4",
    title: "비즈니스 턴어라운드 + PM",
    detail:
      "SKT BMT 20,000 대리점 · 소프트뱅크 100대 · 정부과제 4건.",
    outcome: "정부과제 합격 · 대기업 실사 · 운영 최적화 노하우",
  },
];

export function About() {
  return (
    <section
      id="about"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          About
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          엔지니어링 프로필
        </h2>
      </header>

      <div className="mx-auto mb-14 max-w-3xl space-y-6 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
        <p>
          <span className="font-semibold text-[color:var(--color-foreground)]">
            홍해연입니다.
          </span>{" "}
          22년 8개월간 20여 개 회사에서 풀사이클 개발자 · 팀장 · 이사/실장 ·
          부장을 거쳤습니다.
        </p>
        <ul className="space-y-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 text-sm sm:text-base">
          {HIGHLIGHTS.map((line) => (
            <li key={line} className="flex gap-3">
              <span
                aria-hidden
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-accent)]"
              />
              <span className="text-[color:var(--color-foreground)]">
                {line}
              </span>
            </li>
          ))}
        </ul>
        <p>
          지금은{" "}
          <span className="font-semibold text-[color:var(--color-foreground)]">
            &ldquo;AI 를 쓰고 싶은데 데이터가 밖으로 나가면 안 되는 조직&rdquo;
          </span>{" "}
          에게 로컬 AI 솔루션을 만들고 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
        {STRENGTHS.map((card) => (
          <AboutCard key={card.index} {...card} />
        ))}
      </div>
    </section>
  );
}
