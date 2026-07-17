"use server";

// Application CRUD Server Actions bound to the authenticated user via RLS.

import { revalidatePath } from "next/cache";
import { getServerAuthClient } from "@/lib/supabase/ssr-client";
import type { ApplicationStatus } from "@/lib/supabase/types";

async function ensureAuth() {
  const supabase = await getServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthorized");
  return supabase;
}

export async function ensureApplication(projectId: string) {
  const supabase = await ensureAuth();

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from("applications")
    .insert({ project_id: projectId, status: "interested" })
    .select("id")
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "insert failed");
  revalidatePath(`/radar/project/${projectId}`);
  return inserted.id;
}

export async function updateApplicationStatus(
  applicationId: string,
  projectId: string,
  status: ApplicationStatus,
) {
  const supabase = await ensureAuth();

  const patch: Record<string, string | null> = {
    status,
    updated_at: new Date().toISOString(),
  };
  const nowIso = new Date().toISOString();
  if (status === "applied") patch.applied_at = nowIso;
  if (status === "responded") patch.response_received_at = nowIso;
  if (status === "meeting") patch.meeting_scheduled_at = nowIso;
  if (status === "contracted") patch.contracted_at = nowIso;
  if (status === "rejected") patch.rejected_at = nowIso;

  const { error } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", applicationId);

  if (error) throw new Error(error.message);
  revalidatePath(`/radar/project/${projectId}`);
  revalidatePath("/radar");
}

export async function saveDraftAndNotes(
  applicationId: string,
  projectId: string,
  form: {
    draftProposal?: string;
    draftBudget?: number | null;
    draftDurationDays?: number | null;
    notes?: string;
  },
) {
  const supabase = await ensureAuth();

  const patch: Record<string, string | number | null> = {
    updated_at: new Date().toISOString(),
  };
  if (form.draftProposal !== undefined) patch.draft_proposal = form.draftProposal;
  if (form.draftBudget !== undefined) patch.draft_budget = form.draftBudget;
  if (form.draftDurationDays !== undefined)
    patch.draft_duration_days = form.draftDurationDays;
  if (form.notes !== undefined) patch.notes = form.notes;

  const { error } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", applicationId);

  if (error) throw new Error(error.message);
  revalidatePath(`/radar/project/${projectId}`);
}
