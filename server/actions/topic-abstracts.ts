"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";
import { logAudit } from "@/server/audit";
export type TopicAbstractForm = {
  id: string;
  studentId: string;
  proposedTitle: string;
  background: string;
  objectives: string;
  literatureReview: string;
  methodology: string;
  referenceList: string;
  status: "draft" | "submitted" | "analyzed" | "under_review" | "approved" | "revisions_needed";
  submittedAt: string | null;

  canDelete: boolean;

  latestScore: number | null;
  adviserFeedback: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTAFInput = {
  proposedTitle?: string;
  background?: string;
  objectives?: string;
  literatureReview?: string;
  methodology?: string;
  referenceList?: string;
};

export type UpdateTAFInput = {
  id: string;
  proposedTitle?: string;
  background?: string;
  objectives?: string;
  literatureReview?: string;
  methodology?: string;
  referenceList?: string;
  status?: "draft" | "submitted" | "under_review" | "approved" | "revisions_needed";
};

export type TAFResult =
  | { success: true; data: TopicAbstractForm }
  | { success: false; error: string };

export type TAFListResult =
  | { success: true; data: TopicAbstractForm[] }
  | { success: false; error: string };

type RawTAF = {
  id: string;
  student_id: string;
  proposed_title: string;
  background: string;
  objectives: string;
  literature_review: string;
  methodology: string;
  reference_list: string;
  status: string;
  submitted_at: string | null;
  adviser_feedback: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapTAF(
  raw: RawTAF,
  canDelete = false,
  latestScore: number | null = null,
): TopicAbstractForm {
  return {
    id: raw.id,
    studentId: raw.student_id,
    proposedTitle: raw.proposed_title,
    background: raw.background,
    objectives: raw.objectives,
    literatureReview: raw.literature_review,
    methodology: raw.methodology,
    referenceList: raw.reference_list,
    status: raw.status as TopicAbstractForm["status"],
    submittedAt: raw.submitted_at,
    canDelete,
    latestScore,
    adviserFeedback: raw.adviser_feedback,
    reviewedBy: raw.reviewed_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
export async function createTopicAbstract(
  input: CreateTAFInput
): Promise<TAFResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in to create a topic abstract form." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can create topic abstract forms." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topic_abstract_forms")
    .insert({
      student_id: user.id,
      proposed_title: input.proposedTitle?.trim() || "",
      background: input.background?.trim() || "",
      objectives: input.objectives?.trim() || "",
      literature_review: input.literatureReview?.trim() || "",
      methodology: input.methodology?.trim() || "",
      reference_list: input.referenceList?.trim() || "",
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating topic abstract:", error);
    return { success: false, error: "Failed to create topic abstract form. Please try again." };
  }

  return { success: true, data: mapTAF(data as unknown as RawTAF) };
}
export async function getStudentTopicAbstracts(): Promise<TAFListResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can view their topic abstract forms." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topic_abstract_forms")
    .select("*, group_taf_submissions(taf_id)")
    .eq("student_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("getStudentTopicAbstracts inner-join failed, falling back:", error);
    const { data: plain, error: plainErr } = await supabase
      .from("topic_abstract_forms")
      .select("*")
      .eq("student_id", user.id)
      .order("updated_at", { ascending: false });
    if (plainErr) {
      console.error("Error fetching topic abstracts:", plainErr);
      return { success: false, error: "Failed to fetch topic abstract forms. Please try again." };
    }
    const plainRows = (plain as unknown as RawTAF[]) || [];
    const scoreMap = await fetchLatestScores(supabase, plainRows.map((r) => r.id));
    return {
      success: true,
      data: plainRows.map((r) => {
        const deletable = ["draft", "analyzed"].includes(r.status);
        return mapTAF(r, deletable, scoreMap.get(r.id) ?? null);
      }),
    };
  }

  const rows = data as unknown as Array<RawTAF & { group_taf_submissions?: Array<{ taf_id: string }> | { taf_id: string } }>;
  const scoreMap = await fetchLatestScores(supabase, rows.map((r) => r.id));
  return {
    success: true,
    data: rows.map((r) => {
      const submitted = Array.isArray(r.group_taf_submissions)
        ? r.group_taf_submissions.length > 0
        : !!r.group_taf_submissions;

      const canDelete = ["draft", "analyzed"].includes(r.status) && !submitted;
      return mapTAF(r as RawTAF, canDelete, scoreMap.get(r.id) ?? null);
    }),
  };
}
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
async function fetchLatestScores(
  supabase: SupabaseClient,
  tafIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!tafIds.length) return map;
  const { data, error } = await supabase
    .from("taf_analysis_results")
    .select("taf_id, combined_score, version_number")
    .in("taf_id", tafIds)
    .order("version_number", { ascending: false });
  if (error) {
    console.warn("fetchLatestScores failed:", error);
    return map;
  }
  for (const r of (data || []) as { taf_id: string; combined_score: number | null }[]) {

    if (!map.has(r.taf_id)) {
      map.set(r.taf_id, Number(r.combined_score) || 0);
    }
  }
  return map;
}
export async function getTopicAbstractById(
  id: string
): Promise<TAFResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topic_abstract_forms")
    .select("*")
    .eq("id", id)
    .eq("student_id", user.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Topic abstract form not found." };
    }
    console.error("Error fetching topic abstract:", error);
    return { success: false, error: "Failed to fetch topic abstract form." };
  }

  return { success: true, data: mapTAF(data as unknown as RawTAF) };
}
export async function updateTopicAbstract(
  input: UpdateTAFInput
): Promise<TAFResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in to update." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can update their topic abstract forms." };
  }

  const updates: Record<string, unknown> = {};

  if (input.proposedTitle !== undefined) updates.proposed_title = input.proposedTitle.trim();
  if (input.background !== undefined) updates.background = input.background.trim();
  if (input.objectives !== undefined) updates.objectives = input.objectives.trim();
  if (input.literatureReview !== undefined) updates.literature_review = input.literatureReview.trim();
  if (input.methodology !== undefined) updates.methodology = input.methodology.trim();
  if (input.referenceList !== undefined) updates.reference_list = input.referenceList.trim();
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "submitted") {
      updates.submitted_at = new Date().toISOString();
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("topic_abstract_forms")
    .update(updates)
    .eq("id", input.id)
    .eq("student_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Topic abstract form not found or you don't have access." };
    }
    console.error("Error updating topic abstract:", error);
    return { success: false, error: "Failed to update topic abstract form." };
  }

  return { success: true, data: mapTAF(data as unknown as RawTAF) };
}
export async function deleteTopicAbstracts(
  ids: string[]
): Promise<{ success: true; deleted: number } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can delete their topic abstract forms." };
  }
  if (!ids || ids.length === 0) {
    return { success: false, error: "No forms selected." };
  }

  const supabase = await createClient();
  const { data: submitted } = await supabase
    .from("group_taf_submissions")
    .select("taf_id")
    .in("taf_id", ids)
    .limit(ids.length);

  const blocked = new Set((submitted || []).map((r) => r.taf_id as string));
  const deletable = ids.filter((id) => !blocked.has(id));

  if (deletable.length === 0) {
    return {
      success: false,
      error: "The selected form(s) have been submitted and cannot be deleted.",
    };
  }
  const { data: deletableRows } = await supabase
    .from("topic_abstract_forms")
    .select("id, proposed_title")
    .in("id", deletable);
  const deletedTitles = (deletableRows ?? []).map((r) => ({
    id: r.id as string,
    title: (r.proposed_title as string) || "Untitled",
  }));

  const { error } = await supabase
    .from("topic_abstract_forms")
    .delete()
    .in("id", deletable)
    .eq("student_id", user.id)
    .in("status", ["draft", "analyzed"]);

  if (error) {
    console.error("Error bulk-deleting topic abstracts:", error);
    return { success: false, error: "Failed to delete the selected forms. Please try again." };
  }
  for (const t of deletedTitles) {
    await logAudit({
      action: "taf_deleted",
      entityType: "taf",
      entityId: t.id,
      entityLabel: t.title,
      description: `Deleted topic abstract form "${t.title}".`,
    });
  }

  return { success: true, deleted: deletable.length };
}
export async function deleteTopicAbstract(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can delete their topic abstract forms." };
  }

  const supabase = await createClient();
  const { data: submitted } = await supabase
    .from("group_taf_submissions")
    .select("id")
    .eq("taf_id", id)
    .limit(1);

  if ((submitted || []).length > 0) {
    return {
      success: false,
      error: "This TAF has been submitted and cannot be deleted.",
    };
  }

  const { error } = await supabase
    .from("topic_abstract_forms")
    .delete()
    .eq("id", id)
    .eq("student_id", user.id)
    .in("status", ["draft", "analyzed"]);

  if (error) {
    console.error("Error deleting topic abstract:", error);
    return { success: false, error: "Failed to delete topic abstract form. Only drafts can be deleted." };
  }

  return { success: true };
}