// Sprint Radar · Database Types
// Manually maintained to match Supabase schema (§4 Sprint-Radar-Spec)

export type Channel = "wanted-gigs" | "wishket" | "kmong" | "upwork" | "toptal";
export type ContractType = "outsourcing" | "contractor" | "part-time";
export type WorkType = "remote" | "onsite" | "hybrid";
export type ProjectStatus = "active" | "closed" | "expired";
export type ApplicationStatus =
  | "interested"
  | "drafting"
  | "applied"
  | "responded"
  | "meeting"
  | "contracted"
  | "rejected"
  | "expired";
export type CrawlStatus = "success" | "partial" | "failed";
export type RelevanceStrategy = "rule-based" | "llm";

export interface Project {
  id: string;
  channel: Channel;
  external_id: string;
  external_url: string;
  title: string;
  description: string | null;
  category: string | null;
  skills: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string;
  duration_days: number | null;
  work_type: WorkType | null;
  contract_type: ContractType | null;
  location: string | null;
  applicants_count: number;
  posted_at: string | null;
  deadline_at: string | null;
  raw_data: unknown;
  status: ProjectStatus;
  first_seen_at: string;
  last_seen_at: string;
}

export type ProjectInsert = Omit<
  Project,
  "id" | "first_seen_at" | "last_seen_at"
> & {
  first_seen_at?: string;
  last_seen_at?: string;
};

export interface RelevanceScore {
  id: string;
  project_id: string;
  score: number;
  score_breakdown: Record<string, number>;
  strategy: RelevanceStrategy;
  calculated_at: string;
}

export interface Application {
  id: string;
  project_id: string;
  status: ApplicationStatus;
  draft_proposal: string | null;
  draft_budget: number | null;
  draft_duration_days: number | null;
  applied_at: string | null;
  response_received_at: string | null;
  meeting_scheduled_at: string | null;
  contract_amount: number | null;
  contracted_at: string | null;
  rejected_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlLog {
  id: string;
  channel: Channel;
  started_at: string;
  ended_at: string | null;
  projects_found: number;
  new_projects: number;
  updated_projects: number;
  status: CrawlStatus | null;
  error_message: string | null;
  metadata: unknown;
}
