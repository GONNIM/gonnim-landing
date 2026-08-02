// Content Ingest · 공용 타입
//
// Personal SaaS: URL·텍스트·메일 → z.ai GLM-5.2 요약·인사이트 → Obsidian Clippings/summaries/
// 흐름: extract → summarize → save-clipping

export type IngestSource = "web" | "personal" | "mail";

export type ExtractedContent = {
  source: IngestSource;
  url: string | null;
  title: string | null;
  author: string | null;
  published: string | null;
  text: string;
  fetchedAt: string;
};

export type SummarizeResult = {
  summary: string[];
  insights: string[];
  tags: string[];
  domain: string;
  raw: string;
};

export type SavedClipping = {
  path: string;
  filename: string;
  slug: string;
  createdAt: string;
  folder: string; // 도메인 폴더명 (예: "trading", "business", "misc")
};
