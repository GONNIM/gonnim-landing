// Shared UI formatters + labels for the Radar dashboard.

export const CHANNEL_LABEL: Record<string, string> = {
  "wanted-gigs": "원티드 긱스",
  wishket: "위시켓",
  kmong: "크몽",
  upwork: "Upwork",
  toptal: "Toptal",
};

export const CONTRACT_LABEL: Record<string, string> = {
  outsourcing: "외주(도급)",
  contractor: "기간제(상주)",
  "part-time": "파트타임",
};

export const WORK_TYPE_LABEL: Record<string, string> = {
  remote: "원격",
  onsite: "상주",
  hybrid: "하이브리드",
};

export const APPLICATION_STATUS: Record<string, string> = {
  interested: "관심",
  drafting: "초안 작성",
  applied: "지원 완료",
  responded: "응답 받음",
  meeting: "미팅 예정",
  contracted: "계약",
  rejected: "거절",
  expired: "만료",
};

export const APPLICATION_STATUS_ORDER = [
  "interested",
  "drafting",
  "applied",
  "responded",
  "meeting",
  "contracted",
  "rejected",
  "expired",
] as const;

export function formatKRW(n: number | null | undefined): string {
  if (n == null) return "-";
  const inManwon = Math.round(n / 10000);
  return `${inManwon.toLocaleString()}만원`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

export function scoreTone(score: number) {
  if (score >= 7) return "bg-emerald-500/20 text-emerald-300";
  if (score >= 4) return "bg-amber-500/20 text-amber-300";
  return "bg-neutral-800 text-neutral-400";
}
