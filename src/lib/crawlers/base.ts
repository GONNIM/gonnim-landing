// Base Crawler contract · shared by all channel crawlers.

import type { Channel, ContractType, WorkType } from "@/lib/supabase/types";

export interface RawProject {
  external_id: string;
  external_url: string;
  title: string;
  description?: string | null;
  category?: string | null;
  skills?: string[];
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string;
  duration_days?: number | null;
  work_type?: WorkType | null;
  contract_type?: ContractType | null;
  location?: string | null;
  applicants_count?: number;
  posted_at?: string | null;
  deadline_at?: string | null;
  raw_data?: unknown;
}

export interface CrawlResult {
  channel: Channel;
  projects: RawProject[];
  errors: string[];
  fetchedAt: string;
}

export interface Crawler {
  channel: Channel;
  crawl(): Promise<CrawlResult>;
}
