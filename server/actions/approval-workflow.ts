"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyGrantedPermissions } from "@/server/actions/permissions";
import { formatName } from "@/lib/constants";
import { logAudit } from "@/server/audit";
import { createAdminClient } from "@/server/supabase/admin";

/**
 * Is the advisory group behind this submission ARCHIVED?
 *
 * Read with the service-role client on purpose: an approver usually has no
 * SELECT right on an archived group (the RLS policy grants it to the owning
 * adviser and to members), so a session read would come back empty and look like
 * "not archived" — the guard would pass and the action would go through.
 *
 * Archived groups are read-only for every role: students cannot withdraw or
 * resubmit, approvers cannot approve or return. Reactivating the group restores
 * all of it.
 */
async function submissionGroupArchived(submissionId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const client = admin ?? (await createClient());
    const { data: sub } = await client
      .from("group_taf_submissions")
      .select("group_id")
      .eq("id", submissionId)
      .maybeSingle();
    const groupId = (sub as { group_id?: string } | null)?.group_id;
    if (!groupId) return false;
    const { data: group } = await client
      .from("advisory_groups")
      .select("is_active")
      .eq("id", groupId)
      .maybeSingle();
    return (group as { is_active?: boolean } | null)?.is_active === false;
  } catch (err) {
    console.error("[approval-workflow] archived-group check failed:", err);
    return false;
  }
}

/**
 * Ids of every ARCHIVED advisory group.
 *
 * Read with the service-role client because the RLS policy on `advisory_groups`
 * grants SELECT to the owning adviser, to members, or to anyone when the group
 * is active — an approver asking the session client would simply get no rows and
 * conclude "nothing is archived".
 */
async function archivedGroupIds(): Promise<Set<string>> {
  try {
    const admin = createAdminClient();
    if (!admin) return new Set();
    const { data } = await admin
      .from("advisory_groups")
      .select("id")
      .eq("is_active", false);
    return new Set((data || []).map((g) => g.id as string));
  } catch (err) {
    console.error("[approval-workflow] archived-group lookup failed:", err);
    return new Set();
  }
}

const ARCHIVED_GROUP_ERROR =
  "This advisory group has been archived, so its submissions are read-only. The adviser can unarchive it to reopen the approval.";

// ── Types ──────────────────────────────────────────────────────────

export type ApproverRole = "adviser" | "associate_dean" | "dean" | "vcrdes";

// Note: "use server" files may only export async functions and types —
// constants must not be exported (Next.js enforces this).
const APPROVER_CHAIN: ApproverRole[] = [
  "adviser",
  "associate_dean",
  "dean",
  "vcrdes",
];

/** 1-based index of each approver role in the chain. */
const ROLE_STEP: Record<ApproverRole, number> = {
  adviser: 1,
  associate_dean: 2,
  dean: 3,
  vcrdes: 4,
};

/** Display label of each CHAIN step (never of the caller's role). */
const STEP_LABEL: Record<ApproverRole, string> = {
  adviser: "Adviser",
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
};

// ── SECURITY DEFINER write helper ──────────────────────────
// The approval / return / resubmit state transitions on
// group_taf_submissions go through a SECURITY DEFINER Postgres
// function (migration 024) so RLS UPDATE policies can't block the
// current_approver_role transition (the "new row violates RLS"
// bug). Authorization (WHO may act + WHICH stage) is enforced in
// these server actions BEFORE calling this; the DB function just
// performs the UPDATE with owner privileges.
// Returns null on success, or { message, details } on failure.

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
  /** Academic year like "2025-2026" derived from submittedAt. */
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

// ── Helpers ────────────────────────────────────────────────────────

type SubmissionRow = Record<string, unknown>;

/** Find the active user id for an approver role (single-active rule). */
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

/** Map a raw submission row to the list item shape. */
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

  // Resolve the submission's group so the notification can navigate to it.
  //
  // Service role on purpose: this is system routing data, and the caller is
  // whoever triggered the event — an associate dean returning a TAF has no
  // SELECT on that advisory group, so a session read came back empty and
  // `group_name` landed NULL. Every client builds the TAF link from that name,
  // so a NULL sent "your TAF was returned" to the Topic Abstract Form list
  // instead of the submission.
  const admin = createAdminClient();
  const reader = admin ?? supabase;
  const { data: sub } = await reader
    .from("group_taf_submissions")
    .select("group_id")
    .eq("id", submissionId)
    .single();
  const groupId = sub?.group_id as string | undefined;

  let groupName: string | null = null;
  if (groupId) {
    const { data: g } = await reader
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

// ── Pending approvals for the current approver ─────────────────────

export async function getPendingApprovals(): Promise<ApprovalListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  // `approval.participate` is the permission that puts an account in the queue
  // at all (migration 053). Every chain role holds it by default, so this is a
  // no-op for them — but the department console can now revoke it and the queue
  // actually goes away, instead of the checkbox doing nothing.
  const granted = await getMyGrantedPermissions();
  if (!granted.includes("approval.participate")) {
    return {
      success: false,
      error: "This account has not been granted participation in approvals.",
    };
  }

  const supabase = await createClient();

  let query = supabase
    .from("group_taf_submissions")
    .select("id, group_id, taf_snapshot, combined_score, status, submitted_at, submitted_by, current_approver_role")
    .in("status", ["pending", "under_review"]);

  if (user.role === "adviser") {
    // Adviser sees submissions currently routed to them (they own the group)
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
  } else if (user.role === "department") {
    // OPTIONAL APPROVER — the department may act on ANY pending step, at any
    // time, so its queue is EVERY submission still in flight, whatever step it
    // sits at. Filtering by the caller's role (as the branches above do) is
    // exactly what would hide the other three steps from it.
    //
    // It needs no owner-row merge below: a group it owns routes its entry step
    // to 'adviser', and that row is already in this unrestricted set.
    query = query.not("current_approver_role", "is", null);
  } else {
    return { success: false, error: "Your role cannot approve TAFs." };
  }

  const { data, error } = await query.order("submitted_at", { ascending: false });
  if (error) {
    console.error("[approval-workflow] Failed to load pending:", error);
    return { success: false, error: "Failed to load pending approvals." };
  }

  // Enrich with group name + student info
  const rows: Record<string, unknown>[] = [
    ...((data || []) as Record<string, unknown>[]),
  ];

  // The associate dean and dean supervise students too, so they can own groups
  // — and the owner performs the entry (adviser) step whatever their role.
  // Those rows are routed to "adviser", so this queue must add them explicitly
  // or they would never surface. (VCRDES does not own groups.)
  if (user.role === "associate_dean" || user.role === "dean") {
    const { data: ownGroups } = await supabase
      .from("advisory_groups")
      .select("id")
      .eq("adviser_id", user.id);
    const ownIds = (ownGroups || []).map((g) => g.id as string);

    if (ownIds.length > 0) {
      const { data: ownEntry } = await supabase
        .from("group_taf_submissions")
        .select(
          "id, group_id, taf_snapshot, combined_score, status, submitted_at, submitted_by, current_approver_role",
        )
        .in("status", ["pending", "under_review"])
        .eq("current_approver_role", "adviser")
        .in("group_id", ownIds)
        .order("submitted_at", { ascending: false });

      const seen = new Set(rows.map((r) => r.id as string));
      for (const r of (ownEntry || []) as Record<string, unknown>[]) {
        if (!seen.has(r.id as string)) rows.push(r);
      }
    }
  }

  /**
   * An ARCHIVED group's TAFs are OUT of every approval queue — not in the
   * adviser's Pending TAFs, the approver dashboards, or the department's TAF
   * Submissions list — and reappear as soon as the adviser unarchives the group.
   *
   * Filtered HERE because every one of those surfaces (and the sidebar counts)
   * reads this function; a per-page filter would drift.
   */
  const archived = await archivedGroupIds();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (archived.has(rows[i].group_id as string)) rows.splice(i, 1);
  }
  if (rows.length === 0) return { success: true, data: [] };

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

// ── Approved TAFs (fully approved only) ────────────────────────────

export async function getApprovedTAFs(): Promise<ApprovalListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  // Gated by `taf.approved.view` — the same key the nav and the dashboard tab
  // read, so the list, the tab and the item can never disagree.
  const granted = await getMyGrantedPermissions();
  if (!granted.includes("taf.approved.view")) {
    return {
      success: false,
      error: "This account has not been granted the Approved TAF list.",
    };
  }

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

// ── Approve a submission (routes to next approver) ─────────────────

/**
 * The role a user currently holds. Used to work out which chain levels the
 * group's owner already occupies (so they are skipped rather than signed twice).
 */
async function roleOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return (data?.role as string) || null;
}

/**
 * Record ONE approval decision in the audit trail.
 *
 * Captures BOTH the CHAIN STEP that was decided and the ACCOUNT that decided
 * it, and flags the decision as a STAND-IN when the actor's own role is not the
 * step's role — which is every department decision (the department has no level
 * in the chain, so it always acts in another role's place), and also an owner
 * approving the entry (adviser) step of their own group.
 *
 * Best-effort by design (logAudit never throws), so a logging hiccup can never
 * fail the decision it describes.
 */
async function logDecision(args: {
  submissionId: string;
  entityLabel: string | null;
  decision: "approved" | "returned";
  step: ApproverRole;
  actor: { id: string; name: string; role: string };
  note: string;
  nextRole?: ApproverRole | null;
}): Promise<void> {
  const standIn = args.actor.role !== args.step;
  const stepLabel = STEP_LABEL[args.step];
  const verb = args.decision === "approved" ? "approved" : "returned";
  await logAudit({
    action: args.decision === "approved" ? "taf_approved" : "taf_returned",
    entityType: "taf_submission",
    entityId: args.submissionId,
    entityLabel: args.entityLabel,
    // e.g. "Adviser step approved by Juan Dela Cruz (department) — stand-in"
    description:
      `${stepLabel} step ${verb} by ${args.actor.name} (${args.actor.role})` +
      (standIn ? ` — stand-in for the ${stepLabel} role` : ""),
    metadata: {
      step: args.step,
      stepNumber: ROLE_STEP[args.step],
      stepRole: args.step,
      actorId: args.actor.id,
      actorRole: args.actor.role,
      standIn,
      nextRole: args.nextRole ?? null,
      note: args.note || null,
    },
  });
}

export async function approveSubmission(
  submissionId: string,
  opts?: {
    note?: string;
  },
): Promise<ApproveResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  // Archived group → no decisions, for ANY approver role.
  if (await submissionGroupArchived(submissionId)) {
    return { success: false, error: ARCHIVED_GROUP_ERROR };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("*, group_id, submitted_by, current_approver_role, approval_route")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "TAF has been routed." };

  // ── The group's owner ──────────────────────────────────
  // Ownership (adviser_id) is what makes a user the entry-level approver. The
  // associate dean, dean and VCRDES supervise students too, so the owner is not
  // always an `adviser` — and then `current_approver_role` ("adviser") does not
  // equal their role, which the plain role check used to reject outright.
  const { data: subGroup } = await supabase
    .from("advisory_groups")
    .select("adviser_id")
    .eq("id", sub.group_id)
    .single();
  const ownerId = (subGroup?.adviser_id as string) || null;
  const isOwner = !!ownerId && ownerId === user.id;

  // The STEP being approved — not the caller's role: the two differ when the
  // owner approves the entry (adviser) step, and every column written below is
  // keyed by the step.
  const step = (sub.current_approver_role as ApproverRole | null) || null;
  if (!step) {
    return { success: false, error: "This TAF is not awaiting an approval step." };
  }

  // Allowed when the step is routed to this user's role, when they own the
  // group and it is the entry step, or when they are the DEPARTMENT — the
  // optional approver that may act on ANY pending step, at any time. Note the
  // chain order still comes from `step`: acting first never reorders it.
  if (
    step !== user.role &&
    !(step === "adviser" && isOwner) &&
    user.role !== "department"
  ) {
    return {
      success: false,
      error: `This TAF is not routed to you (currently with: ${step || "the student"}).`,
    };
  }

  // The department's right to act is a PERMISSION now (migration 063 made
  // `approval.participate` grantable/revocable per department account). The role
  // check above lets the department through, so without this a revoked account
  // could still decide any step by calling the action directly.
  if (user.role === "department") {
    const granted = await getMyGrantedPermissions();
    if (!granted.includes("approval.participate")) {
      return {
        success: false,
        error:
          "Your account has not been granted participation in approvals. Ask a department account to grant it.",
      };
    }
  }

  const subRow = sub as unknown as Record<string, unknown>;

  // ── Never the same STEP twice ──────────────────────────
  // Refuse only when THIS account has already signed THIS step. The old guard
  // refused an account that had signed ANY OTHER step, which would silently
  // break the department: it walks a TAF one step at a time (adviser → AD → dean
  // → vcrdes), so its second decision on the same submission is legitimate.
  // `decided` also covers two department accounts racing the SAME step — the
  // first to act completes it, the second is refused rather than double-signing.
  const stepNumber = ROLE_STEP[step];
  const stepStatus = subRow[`approver_${stepNumber}_status`];
  const alreadySignedThisStep = subRow[`approver_${stepNumber}`] === user.id;
  const stepAlreadyDecided =
    stepStatus === "approved" || stepStatus === "rejected";

  if (alreadySignedThisStep) {
    return {
      success: false,
      error: `You already decided the ${STEP_LABEL[step]} step of this TAF. One account cannot sign the same step twice.`,
    };
  }
  if (stepAlreadyDecided) {
    return {
      success: false,
      error: `The ${STEP_LABEL[step]} step of this TAF has already been decided and cannot be signed twice.`,
    };
  }

  const now = new Date().toISOString();
  const note = (opts?.note || "").trim();

  // Who acted, for the audit row (the DB records the id; the description needs
  // the human name).
  const actor = {
    id: user.id,
    name:
      formatName({
        firstName: user.firstName,
        middleInitial: user.middleInitial,
        lastName: user.lastName,
        suffix: user.suffix,
      }) || "Unknown",
    role: user.role as string,
  };
  const tafSnapshot = sub.taf_snapshot as Record<string, unknown> | null;
  const entityLabel = (tafSnapshot?.proposedTitle as string) || null;

  // Who the TAF belongs to — the notification names them so an approver can tell
  // two similar titles apart without opening each one.
  const ownerProfile = await supabase
    .from("profiles")
    .select("first_name, middle_initial, last_name, suffix, sr_code")
    .eq("id", sub.submitted_by as string)
    .maybeSingle();
  const ownerName =
    formatName({
      firstName: ownerProfile.data?.first_name ?? "",
      middleInitial: ownerProfile.data?.middle_initial ?? null,
      lastName: ownerProfile.data?.last_name ?? "",
      suffix: ownerProfile.data?.suffix ?? null,
    }) ||
    (ownerProfile.data?.sr_code as string) ||
    "A student";

  // ── Fixed approval cycle (no adviser route picker) ─────────
  // Student → Adviser → Associate Dean → Dean → VCRDES → fully approved.
  // Any return sends it back to the student.
  const FIXED_CHAIN: ApproverRole[] = [
    "adviser",
    "associate_dean",
    "dean",
    "vcrdes",
  ];

  // The owner's own role level is SKIPPED: they already sign at the entry step,
  // so that level would be the same person signing twice. The single-active-role
  // rule means each approver role maps to exactly one account, so this is exact.
  const ownerRole = await roleOf(ownerId);
  const skipped: ApproverRole[] =
    ownerRole && ownerRole !== "adviser" && (FIXED_CHAIN as string[]).includes(ownerRole)
      ? [ownerRole as ApproverRole]
      : [];

  const myIndex = FIXED_CHAIN.indexOf(step);
  let nextRole: ApproverRole | null = null;
  for (let i = myIndex + 1; i < FIXED_CHAIN.length; i++) {
    if (!skipped.includes(FIXED_CHAIN[i])) {
      nextRole = FIXED_CHAIN[i];
      break;
    }
  }

  // ── Record the decision ────────────────────────────────
  // ── The columns are NUMBERED, not named by role ─────────────────────────
  // `apply_taf_workflow_update()` (migration 024) whitelists approver_1..4 only,
  // so writing `approver_associate_dean_status` silently dropped the decision:
  // the step's row stayed 'pending' in the tracker while `current_approver_role`
  // advanced anyway. Key every write off ROLE_STEP (adviser=1 … vcrdes=4) — the
  // same numbering group-submissions.ts reads when it builds the tracker.
  const update: Record<string, unknown> = {
    [`approver_${stepNumber}_status`]: "approved",
    [`approver_${stepNumber}_decision_note`]: note || null,
    [`approver_${stepNumber}_decided_at`]: now,
    status: "under_review",
    [`approver_${stepNumber}`]: user.id,
  };
  // Store the cycle actually walked (minus the owner's own level) as the route,
  // so the tracker + chat/annotation visibility follow the same cycle.
  if (step === "adviser") {
    update.approval_route = FIXED_CHAIN.slice(1).filter((r) => !skipped.includes(r));
  }

  // ── Final approval at VCRDES ───────────────────────────
  if (step === "vcrdes" || nextRole === null) {
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

    // Audit trail: WHICH step was decided, by WHICH account, and whether that
    // account was a stand-in for the step's own role.
    await logDecision({
      submissionId,
      entityLabel,
      decision: "approved",
      step,
      actor,
      note,
      nextRole: null,
    });

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

  // Audit trail: WHICH step was decided, by WHICH account, and whether that
  // account was a stand-in for the step's own role.
  await logDecision({
    submissionId,
    entityLabel,
    decision: "approved",
    step,
    actor,
    note,
    nextRole,
  });

  // ── Notify the next approver ───────────────────────────
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
      // Name the student and the title: "(Role) for approval" alone told an
      // approver nothing about WHICH TAF had arrived.
      const title = (entityLabel || "Untitled TAF").trim();
      await notify(
        nextUserId,
        submissionId,
        "routed_to_approver",
        `${ownerName} · ${title} — routed to you (${label}) for approval.`,
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

// ── Return a submission to the student for revision ────────────────

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

  if (await submissionGroupArchived(submissionId)) {
    return { success: false, error: ARCHIVED_GROUP_ERROR };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("group_id, submitted_by, current_approver_role, taf_snapshot")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "STAF has been routed." };

  // Ownership (adviser_id) is what makes a user the entry-level approver, so a
  // group owner must be allowed to RETURN the entry step too. Without this the
  // approve path lets them through while this one refuses them, and the TAF stays
  // sitting with them instead of going back to the student.
  const { data: returnGroup } = await supabase
    .from("advisory_groups")
    .select("adviser_id")
    .eq("id", sub.group_id as string)
    .single();
  const returnOwnerId = (returnGroup?.adviser_id as string) || null;
  const isReturnOwner = !!returnOwnerId && returnOwnerId === user.id;

  // Key every write off the STEP being returned — never the caller's role. They
  // differ for an owner, and using the role writes the WRONG approver column
  // (marking the dean's own step rejected while the entry step stayed open).
  const step = sub.current_approver_role as ApproverRole | null;
  if (!step) {
    return { success: false, error: "This TAF is not awaiting an approval step." };
  }

  if (
    step !== user.role &&
    !(step === "adviser" && isReturnOwner) &&
    user.role !== "department"
  ) {
    return {
      success: false,
      error: `This TAF is not routed to you (currently with: ${step || "the student"}).`,
    };
  }

  // Same permission gate as approveSubmission — the department may RETURN only
  // while it holds `approval.participate` (migration 063).
  if (user.role === "department") {
    const granted = await getMyGrantedPermissions();
    if (!granted.includes("approval.participate")) {
      return {
        success: false,
        error:
          "Your account has not been granted participation in approvals. Ask a department account to grant it.",
      };
    }
  }

  const now = new Date().toISOString();

  // NUMBERED columns (see approveSubmission): the 024 function drops any key
  // it does not whitelist, and `approver_<role>` is not one of them.
  const returnStepNumber = ROLE_STEP[step];
  const returnedUpdate = {
    status: "revisions_needed",
    current_approver_role: null,
    [`approver_${returnStepNumber}_status`]: "rejected",
    [`approver_${returnStepNumber}_decision_note`]: clean,
    [`approver_${returnStepNumber}_decided_at`]: now,
    // The step's approver column names the account that actually decided THIS
    // step, whoever it was (owner, stand-in or department) — the same column
    // the approve path writes, so the tracker/audit can show who returned it.
    [`approver_${returnStepNumber}`]: user.id,
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

  // Audit trail: WHICH step was returned, by WHICH account (a return always
  // goes back to the student — the chain order is untouched).
  const returnSnapshot = sub.taf_snapshot as Record<string, unknown> | null;
  await logDecision({
    submissionId,
    entityLabel: (returnSnapshot?.proposedTitle as string) || null,
    decision: "returned",
    step,
    actor: {
      id: user.id,
      name:
        formatName({
          firstName: user.firstName,
          middleInitial: user.middleInitial,
          lastName: user.lastName,
          suffix: user.suffix,
        }) || "Unknown",
      role: user.role as string,
    },
    note: clean,
    nextRole: null,
  });

  await notify(
    sub.submitted_by as string,
    submissionId,
    "returned_to_student",
    `Your TAF was returned for revision by the ${user.role.replace("_", " ")}. Reason: ${clean}`,
  );

  return { success: true, message: "TAF returned to the student for revision." };
}

// ── Student updates a returned submission's content inline ─────────
// Phase A of the "live-edit submitted TAF" remodel: when a TAF has been
// RETURNED for revision, the submitting student can edit its content
// directly on the submission page (rich text). The edit is written to the
// submission's taf_snapshot AND mirrored back to the underling TAF draft
// (topic_abstract_forms) so the draft reflects the revision. Version/scores
// are unchanged — only the returned content is revised.

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

  if (!sub) return { success: false, error: "TAF has been routed." };
  if (sub.submitted_by !== user.id) {
    return { success: false, error: "You can only edit your own submission." };
  }
  // A fully-approved submission is frozen (no further edits).
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

  // 1. Update the submission's snapshot so approvers see the revision.
  const { error: snapErr } = await supabase
    .from("group_taf_submissions")
    .update({ taf_snapshot: snapshot })
    .eq("id", submissionId);

  if (snapErr) {
    console.error("[approval-workflow] snapshot update failed:", snapErr);
    return { success: false, error: "Failed to save your edits." };
  }

  // 2. Mirror back to the TAF draft (rich-text fields as HTML paragraphs,
  // title stays plain text).
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

// ── Student resubmits after revision ───────────────────────────────

export async function resubmitTAF(submissionId: string): Promise<ResubmitResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only the submitting student can resubmit." };
  }

  if (await submissionGroupArchived(submissionId)) {
    return { success: false, error: ARCHIVED_GROUP_ERROR };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("id, group_id, taf_id, submitted_by, status, analysis_version")
    .eq("id", submissionId)
    .single();

  if (!sub) return { success: false, error: "TAF has been routed." };
  if (sub.submitted_by !== user.id) {
    return { success: false, error: "You can only resubmit your own TAF." };
  }
  if (sub.status !== "revisions_needed") {
    return { success: false, error: "This TAF is not in a returned state." };
  }

  // Re-snapshot the submitted TAF's content + its specific analysis version.
  // IMPORTANT: use the submission's stored analysis_version (the version the
  // student originally picked), NOT the latest analysis — otherwise a resubmit
  // after new versions/variants were created would snapshot the wrong content.
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

  // Re-snapshot from the CURRENT TAF draft content. The submitted TAF is
  // edited inline via updateSubmittedTafContent which mirrors to both the
  // submission snapshot and the topic_abstract_forms draft — so the draft is
  // the source of truth for the student's latest writing. Do NOT rebuild
  // from the stored `enhancement` object: that holds AI-improved text from a
  // past analysis and would overwrite the student's manual edits on resubmit.
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
    // Reset this approval round's decisions so the tracker starts clean.
    // The DECIDER ids are cleared too: they are this round's signatures, and the
    // approve path now refuses an account that has already signed the step it is
    // acting on — a stale id from the previous round would lock that account out
    // of the step it is legitimately re-deciding.
    approver_1: null,
    approver_1_status: "pending",
    approver_1_decision_note: null,
    approver_1_decided_at: null,
    approver_2: null,
    approver_2_status: "pending",
    approver_2_decision_note: null,
    approver_2_decided_at: null,
    approver_3: null,
    approver_3_status: "pending",
    approver_3_decision_note: null,
    approver_3_decided_at: null,
    approver_4: null,
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

  // Notify the group adviser
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

  await logAudit({
    action: "taf_resubmitted",
    category: "submission",
    entityType: "submission",
    entityId: submissionId,
    entityLabel: sub.id,
    description: "Resubmitted a returned TAF for review (the chain restarts at the adviser).",
    metadata: { analysisVersion: submittedVersion },
    actor: { id: user.id, email: user.email, role: user.role },
  });

  return { success: true, message: "TAF resubmitted — it is now back with the adviser." };
}

// ── Notifications for the current user ─────────────────────────────

export type ApprovalNotification = {
  id: string;
  submissionId: string | null;
  /** Non-submission notifications (e.g. group joins) carry this instead. */
  groupId: string | null;
  groupName: string | null;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  /**
   * The notification's advisory group is ARCHIVED. Its TAF is out of the
   * approval queues, so a click must NOT navigate — the bell shows a toast
   * instead, and the notification starts working again after unarchive.
   */
  groupArchived: boolean;
};

export type NotificationsResult =
  | { success: true; data: ApprovalNotification[] }
  | { success: false; error: string };

// ── Student unsubmits (withdraws) their TAF from the approval flow ──

export type UnsubmitTafResult = { success: true } | { success: false; error: string };

export async function unsubmitTAF(
  submissionId: string,
): Promise<UnsubmitTafResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only students can unsubmit a TAF." };
  }

  // Archived group → read-only. Refused with a reason instead of letting the RPC
  // delete the submission out of a closed group.
  if (await submissionGroupArchived(submissionId)) {
    return { success: false, error: ARCHIVED_GROUP_ERROR };
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

  // The RPC DELETES the submission row, so every notification pointing at it —
  // the student's, the adviser's, the routed approver's — becomes a dead link
  // that opens "submission no longer available". Clear them with the submission.
  const admin = createAdminClient();
  if (admin) {
    const { error: notifErr } = await admin
      .from("approval_notifications")
      .delete()
      .eq("submission_id", submissionId);
    if (notifErr) {
      console.error(
        "[approval-workflow] clearing notifications on unsubmit failed:",
        notifErr,
      );
    }
  }

  await logAudit({
    action: "taf_unsubmitted",
    category: "submission",
    entityType: "submission",
    entityId: submissionId,
    description: "Withdrew a TAF submission; it is back in their drafts.",
    actor: { id: user.id, email: user.email, role: user.role },
  });

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

  // Which of these groups are archived — one service-role read, because an
  // approver cannot SELECT an archived group through RLS (it would look active).
  const archived = await archivedGroupIds();

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
      groupArchived: archived.has((r.group_id as string) || ""),
    })),
  };
}

export async function markNotificationsRead(input: {
  /** Mark ONE notification read by its id (per-item control). */
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

// Marks EVERY notification of the current user as read. Returns how many
// rows were actually flipped. Used by the "Mark all as read" control so the
// badge can decrement immediately.
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
