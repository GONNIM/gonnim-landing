import { ImpactCard, type ImpactCardProps } from "@/components/ImpactCard";

const RESUME_URL = "#resume";

const IMPACT_CARDS: ImpactCardProps[] = [
  {
    label: "Enterprise Cost Reduction",
    metric: "80억",
    metricSuffix: "원 / 년",
    headline: "원가 절감",
    context:
      "삼성전자·LS전선 머신비전 검사시스템 (2003~2005). 프린터 Web SPC + Network Card + LS전선 라인.",
  },
  {
    label: "B2B Scale",
    metric: "20,000",
    metricSuffix: "대리점",
    headline: "SKT 대리점 서비스",
    context:
      "팩시스템즈 앱 광고 플랫폼 (2013~2017). SK플래닛 C-LINK MOU → SKT BMT 통과.",
  },
  {
    label: "AI Accuracy",
    metric: "25",
    metricSuffix: "% ↑",
    headline: "AI 응답 정확도",
    context:
      "유저커넥트 InterviewX (2024). Local LLM(Llama3) + RAG 파인튜닝.",
  },
  {
    label: "Investment",
    metric: "3억",
    metricSuffix: "원",
    headline: "정부과제 매칭 투자유치",
    context:
      "더코어 FIVIS 웨어러블 IoT (2018~2020). Device ↔ App ↔ Cloud 아키텍처 완주.",
  },
  {
    label: "Reliability",
    metric: "99.9",
    metricSuffix: "%",
    headline: "공공 iOS 앱 안정성",
    context:
      "한국마사회 전자카드 3.0/4.0 (2020~2023). CI/CD 자동화 · 릴리즈 주기 50% 단축.",
  },
  {
    label: "Global",
    metric: "100",
    metricSuffix: "대",
    headline: "소프트뱅크·일본 양판점 납품",
    context: "팩시스템즈 시제품 · 일본 진출 (2013~2017).",
  },
];

export function Impact() {
  return (
    <section
      id="impact"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Impact
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          숫자로 검증된 비즈니스 임팩트
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
          22년 · 20여 개 회사에서 완결된 6가지 실증 지표.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {IMPACT_CARDS.map((card) => (
          <ImpactCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mt-14 flex justify-center">
        <a
          href={RESUME_URL}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)]"
        >
          더 자세한 실적 · Resume 다운로드
          <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}
