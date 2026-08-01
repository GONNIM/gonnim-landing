// 앱 레지스트리 · SSOT
//
// gonnim.dev 하위 개인 앱 목록. 신규 앱 추가 시 여기 1항목만 추가하면:
//   1. /app 대시보드 자동 카드 노출
//   2. 각 앱 layout 백링크 유지 (← My Apps)
//   3. 랜딩 Header 링크 (로그인 시 "My Apps") 그대로 (레지스트리 무관)
//
// 원칙: 인증 필요 앱만 등록. 마케팅 페이지 (/, /about 등) 는 여기 넣지 않음.

export type AppStatus = "active" | "beta" | "wip";

export type AppEntry = {
  id: string;
  href: string;
  emoji: string;
  label: string;
  description: string;
  status: AppStatus;
};

export const APPS: AppEntry[] = [
  {
    id: "ingest",
    href: "/ingest",
    emoji: "🖼️",
    label: "Content Ingest",
    description: "URL·텍스트·이미지 → z.ai 요약·인사이트 → Obsidian Clippings",
    status: "active",
  },
  {
    id: "radar",
    href: "/radar",
    emoji: "📡",
    label: "Sprint Radar",
    description: "위시켓·프리모아·원티드 크롤 → 사업화 판정 → 인사이트 리포트",
    status: "active",
  },
];

export const STATUS_STYLE: Record<AppStatus, string> = {
  active: "bg-emerald-950 text-emerald-300",
  beta: "bg-amber-950 text-amber-300",
  wip: "bg-[color:var(--muted)]/30 text-muted-foreground",
};

export const STATUS_LABEL: Record<AppStatus, string> = {
  active: "active",
  beta: "beta",
  wip: "wip",
};
