import { ServiceCard, type ServiceCardProps } from "@/components/ServiceCard";

const SERVICES: ServiceCardProps[] = [
  {
    index: "1",
    slug: "local-llm",
    name: "Local LLM 온프레미스 구축",
    description:
      "회사 GPU 서버에 Llama3/qwen 배포 + RAG 파이프라인. 데이터 외부 유출 없이 팀 내부 챗봇/검색 구축.",
    evidence: "InterviewX (2024) — 정확도 25% 향상",
    duration: "기간: 2~4주 · 견적: 상담",
  },
  {
    index: "2",
    slug: "grant-poc",
    name: "정부과제 PoC 컨설팅",
    description:
      "제안서 · 발표 · 기술 실증 풀사이클 지원. 과제 신청부터 완주까지 실제 개발자 관점으로 함께.",
    evidence: "4건 완주 · TTA 인증 · 3억 IR 매칭 실적",
    duration: "기간: 과제 일정 · 견적: 상담",
  },
  {
    index: "3",
    slug: "cloud-cost",
    name: "AWS/GCP 코스트 최적화",
    description:
      "Auto Scaling + CloudWatch + CI/CD 자동화. 방치된 리소스 정리 · 리즈드 인스턴스 · 상시 모니터링 설계.",
    evidence: "브레이니카드 (2024) — 월 운영비 15% 절감",
    duration: "기간: 1~2주 · 견적: 상담",
  },
  {
    index: "4",
    slug: "app-stability",
    name: "앱 안정화 · 릴리즈 자동화",
    description:
      "Objective-C / Swift / Kotlin 리팩터링 + GitHub Actions 로 릴리즈 파이프라인 자동화. Sentry/Crashlytics 통합.",
    evidence: "한국마사회 iOS 3년 유지 — 안정성 99.9% · 릴리즈 50% 단축",
    duration: "기간: 2~4주 · 견적: 상담",
  },
];

export function Services() {
  return (
    <section
      id="services"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Services
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          프로젝트 단위 서비스
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
          필요한 것만 짧게 함께 해결합니다.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
        {SERVICES.map((card) => (
          <ServiceCard key={card.index} {...card} />
        ))}
      </div>
    </section>
  );
}
