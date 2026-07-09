import { ProductCard, type ProductCardProps } from "@/components/ProductCard";

const PRODUCTS: ProductCardProps[] = [
  {
    index: "1",
    featured: true,
    tagline: "AI 홍변 v3 · 법령 근거로 답하는 로컬 AI 상담원",
    description:
      "인터넷 없이 사내 PC 에서 돌아갑니다. 개인정보보호법·근로기준법·의료법 등 7종 도메인 준비.",
    target: "노무팀 · 법무팀 · 개인정보팀 · 의료IT",
    tech: "qwen2.5:7b + BGE-M3 + FastAPI + ChromaDB",
    cta: "기업 도입 상담",
  },
  {
    index: "2",
    tagline: "Pocket RAG · 회사 문서 전용 오프라인 챗봇",
    description:
      "임원 노트북 한 대로 구동 · 외부 API 0회. 설계도 · 매뉴얼 · 규정을 넣으면 답변 + 출처를 표시합니다.",
    target: "보안 민감 중소기업 · 전문직",
    tech: "정확도 4.7/5 (94%) · 환각 0/7",
    cta: "데모 요청",
  },
  {
    index: "3",
    tagline: "Toss Tradebot MVP · 한국주식 자동매매 시스템",
    description:
      "Discovery(Crazy Picks) + 자동매매 + Moonshot 3모듈. Toss API 기반 · Confluence 5종 시그널.",
    target: "개인 투자자 · 소규모 트레이딩팀",
    tech: "Confluence 시그널 · 백테스트 리포트 제공",
    cta: "정보 요청",
  },
  {
    index: "4",
    tagline: "FoodBid MVP · 정부 조달 입찰 자동 매칭",
    description:
      "Production Ready · THETAK 인프라 재활용. 공고 자동 스캔 → 매칭 → 알림.",
    target: "정부 조달 입찰 참여 기업",
    tech: "일 3~5건 매칭 · Slack/이메일 알림",
    cta: "문의",
  },
];

export function Products() {
  return (
    <section
      id="products"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Products
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          만들어 놓은 상품
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
          바로 시작할 수 있는 4가지 솔루션.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
        {PRODUCTS.map((card) => (
          <ProductCard key={card.index} {...card} />
        ))}
      </div>
    </section>
  );
}
