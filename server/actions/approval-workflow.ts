"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { formatName } from "@/lib/constants";
export type ApproverRole = "adviser" | "associate_dean" | "dean" | "vcrdes";
const APPROVER_CHAIN: ApproverRole[] = [
  "adviser",
  "associate_dean",
  "dean",
  "vcrdes",
];
const ROLE_STEP: Record<ApproverRole, number> = {
  adviser: 1,
  associate_dean: 2,
  dean: 3,
  vcrdes: 4,
};
async function applyTafWorkflowUpdate(
  submissionId: string,
  updates: Record<string, unknown>,
): Promise<{ message?: string; details?: string } | null> {
  const supabase = await createClient();
  const { error, data } = await supabase.rpc("apply_taf_workflow_update", {
    p_submission_id: submissionId,
    p_updates: updates as unknown as string,
  });
  if (error) {
    return {
      message: error.message,
      details: error.details || undefined,
    };
  }
  void data;
  return null;
}

export type ApprovalListItem = {
  id: string;
  groupId: string;
  groupName: string;
  proposedTitle: string;
  combinedScore: number;
  status: string;
  submittedAt: string;
  submittedBy: string;
  studentName: string;
  studentSrCode: string;
  currentApproverRole: ApproverRole | null;

  academicYear: string;
};

export type ApprovalListResult =
  | { success: true; data: ApprovalListItem[] }
  | { success: false; error: string };

export type ApproveResult =
  | { success: true; message: string; nextRole: ApproverRole | null; fullyApproved: boolean }
  | { success: false; error: string };

export type ReturnResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type ResubmitResult =
  | { success: true; message: string }
  | { success: false; error: string };
type SubmissionRow = Record<string, unknown>;
async function findActiveUserForRole(
  role: Exclude<ApproverRole, "adviser">,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", role)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string) ?? null;
}
function mapListItem(
  row: SubmissionRow,
  groupName: string,
  studentName: string,
  studentSrCode: string,
): ApprovalListItem {
  const submittedAt = row.submitted_at as string;
  const year = new Date(submittedAt).getFullYear();
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    groupName,
    proposedTitle:
      ((row.taf_snapshot as Record<string, unknown> | null)?.proposedTitle as string) ||
      "Untitled",
    combinedScore: parseFloat(String(row.combined_score)) || 0,
    status: row.status as string,
    submittedAt,
    submittedBy: row.submitted_by as string,
    studentName,
    studentSrCode,
    currentApproverRole: (row.current_approver_role as ApproverRole) || null,
    academicYear: `${year}-${year + 1}`,
  };
}

export async function notify(
  userId: string,
  submissionId: string,
  type:
    | "routed_to_approver"
    | "returned_to_student"
    | "resubmitted"
    | "fully_approved"
    | "taf_submitted"
    | "new_comment",
  message: string,
) {
  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("group_id")
    .eq("id", submissionId)
    .single();
  const groupId = sub?.group_id as string | undefined;

  let groupName: string | null = null;
  if (groupId) {
    const { data: g } = await supabase
      .from("advisory_groups")
      .select("name")
      .eq("id", groupId)
      .single();
    groupName = (g?.name as string) || null;
  }

  await supabase.from("approval_notifications").insert({
    user_id: userId,
    submission_id: submissionId,
    group_id: groupId || null,
    group_name: groupName,
    type,
    message,
  });
}
export async function getPendingApprovals(): Promise<ApprovalListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();

  let query = supabase
    .from("group_taf_submissions")
    .select("id, group_id, taf_snapshot, combined_score, status, submitted_at, submitted_by, current_approver_role")
    .in("status", ["pending", "under_review"]);

  if (user.role === "adviser") {

    const { data: groups } = await supabase
      .from("advisory_groups")
      .select("id")
      .eq("adviser_id", user.id);
    const groupIds = (groups || []).map((g) => g.id as string);
    if (groupIds.length === 0) return { success: true, data: [] };
    query = query
      .in("group_id", groupIds)
      .eq("current_approver_role", "adviser");
  } else if (
    user.role === "associate_dean" ||
    user.role === "dean" ||
    user.role === "vcrdes"
  ) {
    query = query.eq("current_approver_role", user.role);
  } else {
    return { success: false, error: "Your role cannot approve TAFs." };
  }

  const { data, error } = await query.order("submitted_at", { ascending: false });
  if (error) {
    console.error("[approval-workflow] Failed to load pending:", error);
    return { success: false, error: "Failed to load pending approvals." };
  }
  const rows = data || [];
  const groupIds = Array.from(new Set(rows.map((r) => r.group_id as string)));
  const studentIds = Array.from(new Set(rows.map((r) => r.submitted_by as string)));

  const [{ data: groups }, { data: students }] = await Promise.all([
    supabase.from("advisory_groups").select("id, name").in("id", groupIds),
    supabase
      .from("profiles")
      .select("id, first_name, middle_initial, last_name, suffix, sr_code")
      .in("id", studentIds),
  ]);

  const groupNameMap = new Map((groups || []).map((g) => [g.id as string, (g as { name: string }).name]));
  const studentMap = new Map(
    (students || []).map((s) => [
      s.id as string,
      {
        name:
          formatName({
            firstName: s.first_name,
            middleInitial: s.middle_initial,
            lastName: s.last_name,
            suffix: s.suffix,
          }) || "Student",
        srCode: (s.sr_code as string) || "",
      },
    ]),
  );

  return {
    success: true,
    data: rows.map((r) => {
      const info = studentMap.get(r.submitted_by as string);
      return mapListItem(
        r as SubmissionRow,
        groupNameMap.get(r.group_id as string) || "Group",
        info?.name || "Student",
        info?.srCode || "",
      );
    }),
  };
}
export async function getApprovedTAFs(): Promise<ApprovalListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_taf_submissions")
    .select("id, group_id, taf_snapshot, combined_score, status, submitted_at, submitted_by, current_approver_role, fully_approved_at")
    .not("fully_approved_at", "is", null)
    .order("fully_approved_at", { ascending: false });

  if (error) {
    console.error("[approval-workflow] Failed to load approved:", error);
    return { success: false, error: "Failed to load approved TAFs." };
  }

  const rows = data || [];
  const groupIds = Array.from(new Set(rows.map((r) => r.group_id as string)));
  const studentIds = Array.from(new Set(rows.map((r) => r.submitted_by as string)));

  const [{ data: groups }, { data: students }] = await Promise.all([
    supabase.from("advisory_groups").select("id, name").in("id", groupIds),
    supabase
      .from("profiles")
      .select("id, first_name, middle_initial, last_name, suffix, sr_code")
      .in("id", studentIds),
  ]);

  const groupNameMap = new Map((groups || []).map((g) => [g.id as string, (g as { name: string }).name]));
  const studentMap = new Map(
    (students || []).map((s) => [
      s.id as string,
      {
        name:
          formatName({
            firstName: s.first_name,
            middleInitial: s.middle_initial,
            lastName: s.last_name,
            suffix: s.suffix,
          }) || "Student",
        srCode: (s.sr_code as string) || "",
      },
    ]),
  );

  return {
    success: true,
    data: rows.map((r) => {
      const info = studentMap.get(r.submitted_by as string);
      return mapListItem(
        r as SubmissionRow,
        groupNameMap.get(r.group_id as string) || "Group",
        info?.name || "Student",
        info?.srCode || "",
      );
    }),
  };
}
export async function approveSubmission(
  submissionId: string,
  opts?: {
    note?: string;
  },
): Promise<ApproveResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("*, group_id, submitted_by, current_approver_role, approval_route")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "Submission not found." };
  if (sub.current_approver_role !== user.role) {
    return {
      success: false,
      error: `This TAF is not routed to you (currently with: ${sub.current_approver_role || "the student"}).`,
    };
  }

  const step = ROLE_STEP[user.role as ApproverRole];
  const now = new Date().toISOString();
  const note = (opts?.note || "").trim();
  const FIXED_CHAIN: ApproverRole[] = [
    "adviser",
    "associate_dean",
    "dean",
    "vcrdes",
  ];
  const myIndex = FIXED_CHAIN.indexOf(user.role as ApproverRole);
  let nextRole: ApproverRole | null =
    myIndex >= 0 && myIndex < FIXED_CHAIN.length - 1
      ? FIXED_CHAIN[myIndex + 1]
      : null;
  const update: Record<string, unknown> = {
    [`approver_${step}_status`]: "approved",
    [`approver_${step}_decision_note`]: note || null,
    [`approver_${step}_decided_at`]: now,
    status: "under_review",
    [`approver_${step}`]: user.id,
  };
  if (user.role === "adviser") {
    update.approval_route = ["associate_dean", "dean", "vcrdes"];
  }
  if (user.role === "vcrdes" || nextRole === null) {
    update.status = "approved";
    update.current_approver_role = null;
    update.fully_approved_at = now;
    nextRole = null;

    const updateErr = await applyTafWorkflowUpdate(submissionId, update);

    if (updateErr) {
      console.error("[approval-workflow] Approve failed:", updateErr);
      return {
        success: false,
        error: `Failed to record approval: ${updateErr.message || updateErr.details || "RLS or DB error"}.`,
      };
    }

    await notify(
      sub.submitted_by as string,
      submissionId,
      "fully_approved",
      "Your TAF has been fully approved by all approvers. 🎉",
    );
    const { data: group } = await supabase
      .from("advisory_groups")
      .select("adviser_id")
      .eq("id", sub.group_id)
      .single();
    if (group?.adviser_id) {
      await notify(
        group.adviser_id as string,
        submissionId,
        "fully_approved",
        "A TAF from your advisory group has been fully approved.",
      );
    }
    return {
      success: true,
      message: "TAF fully approved! 🎉",
      nextRole: null,
      fullyApproved: true,
    };
  }

  update.current_approver_role = nextRole;

  const updateErr = await applyTafWorkflowUpdate(submissionId, update);

  if (updateErr) {
    console.error("[approval-workflow] Approve failed:", updateErr);
    return {
      success: false,
      error: `Failed to record approval: ${updateErr.message || updateErr.details || "RLS or DB error"}.`,
    };
  }
  if (nextRole) {
    const nextUserId =
      nextRole === "adviser"
        ? (await (async () => {
            const { data: g } = await supabase
              .from("advisory_groups")
              .select("adviser_id")
              .eq("id", sub.group_id)
              .single();
            return (g?.adviser_id as string) ?? null;
          })())
        : await findActiveUserForRole(nextRole as Exclude<ApproverRole, "adviser">);

    if (nextUserId) {
      const label =
        nextRole === "adviser"
          ? "the adviser"
          : nextRole.replace("_", " ").toUpperCase();
      await notify(
        nextUserId,
        submissionId,
        "routed_to_approver",
        `A TAF has been routed to you (${label}) for approval.`,
      );
    }
  }

  return {
    success: true,
    message: `Approved — routed to ${nextRole?.replace("_", " ") || "final stage"}.`,
    nextRole,
    fullyApproved: false,
  };
}
export async function returnSubmission(
  submissionId: string,
  reason: string,
): Promise<ReturnResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const clean = reason.trim();
  if (!clean) {
    return { success: false, error: "Please provide a reason for returning the TAF." };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("group_id, submitted_by, current_approver_role")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "Submission not found." };

  if (sub.current_approver_role !== user.role) {
    return {
      success: false,
      error: `This TAF is not routed to you (currently with: ${sub.current_approver_role || "the student"}).`,
    };
  }

  const step = ROLE_STEP[user.role as ApproverRole];
  const now = new Date().toISOString();

  const returnedUpdate = {
    status: "revisions_needed",
    current_approver_role: null,
    [`approver_${step}_status`]: "rejected",
    [`approver_${step}_decision_note`]: clean,
    [`approver_${step}_decided_at`]: now,
    returned_reason: clean,
    returned_by: user.id,
    returned_at: now,
  };

  const updateErr = await applyTafWorkflowUpdate(submissionId, returnedUpdate);

  if (updateErr) {
    console.error("[approval-workflow] Return failed:", updateErr);
    return {
      success: false,
      error: `Failed to return the TAF: ${updateErr.message || updateErr.details || "RLS or DB error"}.`,
    };
  }

  await notify(
    sub.submitted_by as string,
    submissionId,
    "returned_to_student",
    `Your TAF was returned for revision by the ${user.role.replace("_", " ")}. Reason: ${clean}`,
  );

  return { success: true, message: "TAF returned to the student for revision." };
}
export type UpdateSubmittedTafResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function updateSubmittedTafContent(
  submissionId: string,
  data: {
    proposedTitle: string;
    background: string;
    objectives: string;
    literatureReview: string;
    methodology: string;
    referenceList: string;
  },
): Promise<UpdateSubmittedTafResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only the submitting student can edit this." };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("id, taf_id, submitted_by, status")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "Submission not found." };
  if (sub.submitted_by !== user.id) {
    return { success: false, error: "You can only edit your own submission." };
  }

  if (sub.status === "approved") {
    return { success: false, error: "This TAF is already fully approved and is locked." };
  }

  const snapshot = {
    proposedTitle: data.proposedTitle || "",
    background: data.background || "",
    objectives: data.objectives || "",
    literatureReview: data.literatureReview || "",
    methodology: data.methodology || "",
    referenceList: data.referenceList || "",
  };
  const { error: snapErr } = await supabase
    .from("group_taf_submissions")
    .update({ taf_snapshot: snapshot })
    .eq("id", submissionId);

  if (snapErr) {
    console.error("[approval-workflow] snapshot update failed:", snapErr);
    return { success: false, error: "Failed to save your edits." };
  }
  const { error: draftErr } = await supabase
    .from("topic_abstract_forms")
    .update({
      proposed_title: data.proposedTitle || undefined,
      background: data.background || undefined,
      objectives: data.objectives || undefined,
      literature_review: data.literatureReview || undefined,
      methodology: data.methodology || undefined,
      reference_list: data.referenceList || undefined,
    })
    .eq("id", sub.taf_id);

  if (draftErr) {
    console.error("[approval-workflow] draft mirror update failed:", draftErr);
  }

  return {
    success: true,
    message: "Your edits were saved.",
  };
}
export async function resubmitTAF(submissionId: string): Promise<ResubmitResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only the submitting student can resubmit." };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("id, group_id, taf_id, submitted_by, status, analysis_version")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "Submission not found." };
  if (sub.submitted_by !== user.id) {
    return { success: false, error: "You can only resubmit your own TAF." };
  }
  if (sub.status !== "revisions_needed") {
    return { success: false, error: "This TAF is not in a returned state." };
  }
  const submittedVersion = (sub.analysis_version as number) || 1;
  const [tafRes, analysisRes] = await Promise.all([
    supabase
      .from("topic_abstract_forms")
      .select("proposed_title, background, objectives, literature_review, methodology, reference_list")
      .eq("id", sub.taf_id)
      .single(),
    supabase
      .from("taf_analysis_results")
      .select("version_number, combined_score, judgment, form_fields_snapshot, enhancement, internal_similarity_score, external_similarity_score")
      .eq("taf_id", sub.taf_id)
      .eq("version_number", submittedVersion)
      .maybeSingle(),
  ]);

  if (analysisRes?.error) {
    console.error("[approval-workflow] Resubmit analysis lookup error:", analysisRes.error);
  }

  const now = new Date().toISOString();
  const tafRow = (tafRes.data as Record<string, unknown> | null) || ({} as Record<string, unknown>);
  const tafSnapshot: Record<string, unknown> = {
    proposedTitle: (tafRow.proposed_title as string) || "",
    background: (tafRow.background as string) || "",
    objectives: (tafRow.objectives as string) || "",
    literatureReview: (tafRow.literature_review as string) || "",
    methodology: (tafRow.methodology as string) || "",
    referenceList: (tafRow.reference_list as string) || "",
  };

  const analysisRow = analysisRes?.data as Record<string, unknown> | null;

  const resubmitUpdate = {
    status: "pending",
    current_approver_role: "adviser",

    approver_1_status: "pending",
    approver_1_decision_note: null,
    approver_1_decided_at: null,
    approver_2_status: "pending",
    approver_2_decision_note: null,
    approver_2_decided_at: null,
    approver_3_status: "pending",
    approver_3_decision_note: null,
    approver_3_decided_at: null,
    approver_4_status: "pending",
    approver_4_decision_note: null,
    approver_4_decided_at: null,
    approval_route: null,
    taf_snapshot: JSON.parse(JSON.stringify(tafSnapshot)),
    analysis_version: (analysisRow?.version_number as number) || 1,
    combined_score: parseFloat(String(analysisRow?.combined_score)) || 0,
    judgment: (analysisRow?.judgment as string) || "low_similarity",
    internal_score: parseFloat(String(analysisRow?.internal_similarity_score)) || 0,
    external_score: parseFloat(String(analysisRow?.external_similarity_score)) || 0,
    returned_reason: null,
    returned_by: null,
    returned_at: null,
    resubmitted_at: now,
  };

  const updateErr = await applyTafWorkflowUpdate(submissionId, resubmitUpdate);

  if (updateErr) {
    console.error("[approval-workflow] Resubmit failed:", updateErr);
    return {
      success: false,
      error: `Failed to resubmit the TAF: ${updateErr.message || updateErr.details || "RLS or DB error"}.`,
    };
  }
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("adviser_id")
    .eq("id", sub.group_id)
    .single();
  if (group?.adviser_id) {
    await notify(
      group.adviser_id as string,
      submissionId,
      "resubmitted",
      "A student has resubmitted a revised TAF for your review.",
    );
  }

  return { success: true, message: "TAF resubmitted — it is now back with the adviser." };
}
export type ApprovalNotification = {
  id: string;
  submissionId: string | null;

  groupId: string | null;
  groupName: string | null;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResult =
  | { success: true; data: ApprovalNotification[] }
  | { success: false; error: string };
export type UnsubmitTafResult = { success: true } | { success: false; error: string };

export async function unsubmitTAF(
  submissionId: string,
): Promise<UnsubmitTafResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only students can unsubmit a TAF." };
  }

  const supabase = await createClient();
  const { error, data } = await supabase.rpc("unsubmit_taf_submission", {
    p_submission_id: submissionId,
  });

  if (error) {
    console.error("[approval-workflow] Unsubmit RPC error:", error);
    return { success: false, error: error.message };
  }

  if (data === false) {
    return {
      success: false,
      error:
        "You can only unsubmit a TAF that you submitted, and it must not be fully approved yet.",
    };
  }

  return { success: true };
}

export async function getMyNotifications(): Promise<NotificationsResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval_notifications")
    .select("id, submission_id, group_id, group_name, type, message, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[approval-workflow] Failed to load notifications:", error);
    return { success: false, error: "Failed to load notifications." };
  }

  return {
    success: true,
    data: (data || []).map((r) => ({
      id: r.id as string,
      submissionId: (r.submission_id as string) || null,
      groupId: (r.group_id as string) || null,
      groupName: (r.group_name as string) || null,
      type: r.type as string,
      message: r.message as string,
      readAt: r.read_at as string | null,
      createdAt: r.created_at as string,
    })),
  };
}

export async function markNotificationsRead(input: {

  id?: string;
  submissionId?: string;
  groupId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();
  let query = supabase
    .from("approval_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (input?.id) {
    query = query.eq("id", input.id);
  } else if (input?.submissionId) {
    query = query.eq("submission_id", input.submissionId);
  } else if (input?.groupId) {
    query = query.eq("group_id", input.groupId);
  }

  const { error } = await query;
  if (error) {
    console.error("[notifications] Failed to mark notifications read:", error);
    return { success: false, error: "Failed to mark notifications as read." };
  }
  return { success: true };
}
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  marked?: number;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    console.error("[notifications] Failed to mark all notifications read:", error);
    return { success: false, error: "Failed to mark all notifications as read." };
  }
  return { success: true, marked: (data || []).length };
}