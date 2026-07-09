export type InquiryGroup = "products" | "services" | "other";

export type InquiryCategory = {
  slug: string;
  label: string;
  group: InquiryGroup;
};

export const INQUIRY_CATEGORIES: InquiryCategory[] = [
  {
    slug: "ai-hongbyun",
    label: "AI 홍변 v3 (법령 근거 로컬 AI 상담원)",
    group: "products",
  },
  {
    slug: "pocket-rag",
    label: "Pocket RAG (오프라인 문서 챗봇)",
    group: "products",
  },
  {
    slug: "toss-tradebot",
    label: "Toss Tradebot MVP (자동매매)",
    group: "products",
  },
  {
    slug: "foodbid",
    label: "FoodBid MVP (정부 조달 입찰 매칭)",
    group: "products",
  },
  {
    slug: "local-llm",
    label: "Local LLM 온프레미스 구축",
    group: "services",
  },
  {
    slug: "grant-poc",
    label: "정부과제 PoC 컨설팅",
    group: "services",
  },
  {
    slug: "cloud-cost",
    label: "AWS/GCP 코스트 최적화",
    group: "services",
  },
  {
    slug: "app-stability",
    label: "앱 안정화 · 릴리즈 자동화",
    group: "services",
  },
  {
    slug: "other",
    label: "기타 (상담 주제에 직접 기술)",
    group: "other",
  },
];

const CATEGORY_SLUGS = new Set(INQUIRY_CATEGORIES.map((c) => c.slug));

export function isValidCategorySlug(slug: string | null | undefined): slug is string {
  if (!slug) return false;
  return CATEGORY_SLUGS.has(slug);
}

export const GROUP_LABELS: Record<InquiryGroup, string> = {
  products: "상품 (Products)",
  services: "프로젝트 서비스 (Services)",
  other: "기타",
};

export function contactHrefForSlug(slug: string): string {
  return `?category=${encodeURIComponent(slug)}#contact`;
}
