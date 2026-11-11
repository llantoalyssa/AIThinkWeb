"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";
import { logAudit } from "@/server/audit";
import { canOwnAdvisoryGroup } from "@/lib/roles";
import { getGrantedPermissions } from "./permissions";
import { groupSlug } from "@/lib/slug";

/**
 * Group descriptions are card labels, not abstracts — one shared budget for
 * every write path (create + edit) and for the dialogs' character counters.
 * Not exported: a "use server" module may only export async functions.
 */
const DESCRIPTION_MAX = 200;

export type AdvisoryGroup = {
  id: string;
  adviserId: string;
  name: string;
  description: string | null;
  joinCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdvisoryGroupInput = {
  name: string;
  description?: string;
};

export type UpdateAdvisoryGroupInput = {
  id: string;
  name?: string;
  description?: string;
  /** Archive (set inactive) or reactivate a group. */
  isActive?: boolean;
};

export type AdvisoryGroupResult =
  | { success: true; data: AdvisoryGroup }
  | { success: false; error: string };

export type AdvisoryGroupsListResult =
  | { success: true; data: AdvisoryGroup[] }
  | { success: false; error: string };

// ── Department permission guard ────────────────────────────────
/**
 * The department obeys the permission set like every other role: its nav is
 * filtered and its sections gated in the UI, and THIS is the half that refuses
 * a direct call — a department account without `groups.view` / `groups.create`
 * must not be able to list or create groups by invoking the action itself.
 *
 * Only the department is affected. An adviser / associate dean / dean passes
 * through untouched: their role defaults include both keys (migration 053) and
 * this branch is never taken for them.
 *
 * Fails OPEN on a reader error. The role gate above has already established a
 * legitimate group owner, and a broken permission read must not lock a whole
 * role out of a surface it has always had; the UI gate still hides it and RLS
 * is the final authority.
 */
async function departmentBlocked(
  role: string,
  userId: string,
  permission: string
): Promise<boolean> {
  if (role !== "department") return false;
  try {
    const granted = await getGrantedPermissions(userId);
    return !granted.includes(permission);
  } catch (error) {
    console.error(`[advisory-groups] could not resolve ${permission}:`, error);
    return false;
  }
}

/** Message shown when a department account lacks the capability. */
function departmentDeniedMessage(action: string, permission: string): string {
  return `Your account has not been granted permission to ${action} advisory groups (${permission}). Ask a department account to grant it.`;
}

// ── Create a new advisory group ─────────────────────────────

export async function createAdvisoryGroup(
  input: CreateAdvisoryGroupInput
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to create an advisory group." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can create advisory groups." };
  }

  // The department's half of the permission set (see departmentBlocked).
  if (await departmentBlocked(user.role, user.id, "groups.create")) {
    return { success: false, error: departmentDeniedMessage("create", "groups.create") };
  }

  const name = input.name.trim();
  const description = input.description?.trim() || null;

  // Validation
  if (!name) {
    return { success: false, error: "Group name is required." };
  }

  if (name.length < 3) {
    return { success: false, error: "Group name must be at least 3 characters." };
  }

  if (name.length > 100) {
    return { success: false, error: "Group name must not exceed 100 characters." };
  }

  // Description is OPTIONAL — an adviser may leave it blank. Only cap it.
  if (description && description.length > DESCRIPTION_MAX) {
    return {
      success: false,
      error: `Description must not exceed ${DESCRIPTION_MAX} characters.`,
    };
  }

  const supabase = await createClient();

  // Group ROUTES are derived from the NAME (…/groups/<slug>), so two groups with
  // the same name under one owner produce the same URL — both links then open
  // the same group and the other becomes unreachable. Refuse the collision
  // instead of silently creating an ambiguous route.
  const { data: existingGroups } = await supabase
    .from("advisory_groups")
    .select("id, name")
    .eq("adviser_id", user.id);

  const clash = (existingGroups ?? []).find(
    (g) => groupSlug(g.name as string) === groupSlug(name),
  );
  if (clash) {
    return {
      success: false,
      error: `You already have an advisory group named "${clash.name}". Group links are built from the name, so two identical names would point at the same page — choose a different name.`,
    };
  }

  const { data, error } = await supabase
    .from("advisory_groups")
    .insert({
      adviser_id: user.id,
      name,
      description,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating advisory group:", error);
    return { success: false, error: "Failed to create advisory group. Please try again." };
  }

  return {
    success: true,
    data: {
      id: data.id,
      adviserId: data.adviser_id,
      name: data.name,
      description: data.description,
      joinCode: data.join_code,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

// ── Get all advisory groups for the current adviser ─────────────

export async function getAdviserAdvisoryGroups(): Promise<AdvisoryGroupsListResult> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to view advisory groups." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can view advisory groups." };
  }

  // The department's half of the permission set (see departmentBlocked): the
  // LIST is what the Advisory Group section and its cards are built from.
  if (await departmentBlocked(user.role, user.id, "groups.view")) {
    return { success: false, error: departmentDeniedMessage("view", "groups.view") };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("advisory_groups")
    .select("*")
    .eq("adviser_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching advisory groups:", error);
    return { success: false, error: "Failed to fetch advisory groups. Please try again." };
  }

  const groups: AdvisoryGroup[] = data.map((group) => ({
    id: group.id,
    adviserId: group.adviser_id,
    name: group.name,
    description: group.description,
    joinCode: group.join_code,
    isActive: group.is_active,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
  }));

  return { success: true, data: groups };
}

// ── Get a single advisory group by ID ───────────────────

export async function getAdvisoryGroupById(
  groupId: string
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to view this advisory group." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can view advisory groups." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("advisory_groups")
    .select("*")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Advisory group not found or you don't have access." };
    }
    console.error("Error fetching advisory group:", error);
    return { success: false, error: "Failed to fetch advisory group. Please try again." };
  }

  return {
    success: true,
    data: {
      id: data.id,
      adviserId: data.adviser_id,
      name: data.name,
      description: data.description,
      joinCode: data.join_code,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

// ── Update an advisory group ─────────────────────────────

export async function updateAdvisoryGroup(
  input: UpdateAdvisoryGroupInput
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to update an advisory group." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can update advisory groups." };
  }

  const updates: Record<string, unknown> = {};
  
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return { success: false, error: "Group name is required." };
    }
    if (name.length < 3) {
      return { success: false, error: "Group name must be at least 3 characters." };
    }
    if (name.length > 100) {
      return { success: false, error: "Group name must not exceed 100 characters." };
    }
    updates.name = name;
  }

  if (input.description !== undefined) {
    const description = input.description.trim();
    // Same 200-character budget as create: a description is a card label, not
    // an abstract, and the edit dialog used to accept any length at all.
    if (description.length > DESCRIPTION_MAX) {
      return {
        success: false,
        error: `Description must not exceed ${DESCRIPTION_MAX} characters.`,
      };
    }
    updates.description = description || null;
  }

  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("advisory_groups")
    .update(updates)
    .eq("id", input.id)
    .eq("adviser_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Advisory group not found or you don't have access." };
    }
    console.error("Error updating advisory group:", error);
    return { success: false, error: "Failed to update advisory group. Please try again." };
  }

  return {
    success: true,
    data: {
      id: data.id,
      adviserId: data.adviser_id,
      name: data.name,
      description: data.description,
      joinCode: data.join_code,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

// ── Delete an advisory group ─────────────────────────────

export async function deleteAdvisoryGroup(
  groupId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to delete an advisory group." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can delete advisory groups." };
  }

  const supabase = await createClient();

  // Only allow deletion when NO students have joined the group. Otherwise the
  // adviser should archive it instead (which keeps member data intact).
  const { count: memberCount, error: countErr } = await supabase
    .from("student_group_memberships")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);

  if (countErr) {
    console.error("Error counting group members:", countErr);
  } else if (memberCount && memberCount > 0) {
    return {
      success: false,
      error:
        "This group has members. You can't delete it — archive it instead (it becomes inactive and hidden from your active groups).",
    };
  }

  // Read the name BEFORE deleting — once the row is gone the trail should
  // still say what was removed.
  const { data: groupRow } = await supabase
    .from("advisory_groups")
    .select("name")
    .eq("id", groupId)
    .single();
  const groupName = (groupRow?.name as string) || null;

  const { error } = await supabase
    .from("advisory_groups")
    .delete()
    .eq("id", groupId)
    .eq("adviser_id", user.id);

  if (error) {
    console.error("Error deleting advisory group:", error);
    return { success: false, error: "Failed to delete advisory group. Please try again." };
  }

  // Audit trail — the group row is gone, so the name is snapshotted.
  await logAudit({
    action: "group_deleted",
    entityType: "advisory_group",
    entityId: groupId,
    entityLabel: groupName,
    description: `Deleted advisory group "${groupName ?? groupId}".`,
  });

  return { success: true };
}

// ── Regenerate join code for an advisory group ────────────────────────────

export async function regenerateJoinCode(
  groupId: string
): Promise<{ success: true; newCode: string } | { success: false; error: string }> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to regenerate the join code." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can regenerate join codes." };
  }

  const supabase = await createClient();

  // Call the database function to regenerate the code
  const { data, error } = await supabase.rpc("regenerate_group_join_code", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("Error regenerating join code:", error);
    return { success: false, error: "Failed to regenerate join code. Please try again." };
  }

  return { success: true, newCode: data };
}

// ── Get total student count across all groups for the adviser ─────────

export async function getAdviserTotalStudents(): Promise<
  { success: true; count: number } | { success: false; error: string }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can view this." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("adviser_id", user.id);

  if (error) {
    console.error("Error fetching adviser groups:", error);
    return { success: false, error: "Failed to fetch stats." };
  }

  if (data.length === 0) {
    return { success: true, count: 0 };
  }

  const groupIds = data.map((g) => g.id);

  const { count, error: countError } = await supabase
    .from("student_group_memberships")
    .select("*", { count: "exact", head: true })
    .in("group_id", groupIds);

  if (countError) {
    console.error("Error counting students:", countError);
    return { success: false, error: "Failed to count students." };
  }

  return { success: true, count: count ?? 0 };
}

// ── Per-group joined-student counts (for the group cards) ───────────

/**
 * One query for every group the caller owns, so each card can show its own
 * joined-student count without a request per card.
 */
export async function getGroupMemberCounts(): Promise<
  { success: true; counts: Record<string, number> } | { success: false; error: string }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return {
      success: false,
      error: "Only advisers, the associate dean, the dean and the department can view this.",
    };
  }

  const supabase = await createClient();

  const { data: groups, error } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("adviser_id", user.id);

  if (error) {
    console.error("Error fetching groups for member counts:", error);
    return { success: false, error: "Failed to fetch group members." };
  }

  const ids = (groups || []).map((g) => g.id as string);
  if (ids.length === 0) return { success: true, counts: {} };

  const { data: rows, error: memberError } = await supabase
    .from("student_group_memberships")
    .select("group_id")
    .in("group_id", ids);

  if (memberError) {
    console.error("Error counting group members:", memberError);
    return { success: false, error: "Failed to count group members." };
  }

  const counts: Record<string, number> = {};
  for (const r of (rows || []) as { group_id: string }[]) {
    counts[r.group_id] = (counts[r.group_id] || 0) + 1;
  }

  return { success: true, counts };
}

// ── Per-group pending-TAF counts (for the group cards) ──────────────

/**
 * TAFs from each of the caller's groups that are still awaiting a decision —
 * the number the card's badge shows, so a card can say "3 pending" instead of
 * a meaningless "Active".
 */
export async function getGroupPendingCounts(): Promise<
  { success: true; counts: Record<string, number> } | { success: false; error: string }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return {
      success: false,
      error: "Only advisers, the associate dean, the dean and the department can view this.",
    };
  }

  const supabase = await createClient();

  // ACTIVE groups only: an archived group's TAFs are removed from every approval
  // queue (see getPendingApprovals), so its dashboard card must not show a
  // pending badge that no list backs up.
  const { data: groups, error } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("adviser_id", user.id)
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching groups for pending counts:", error);
    return { success: false, error: "Failed to fetch group submissions." };
  }

  const ids = (groups || []).map((g) => g.id as string);
  if (ids.length === 0) return { success: true, counts: {} };

  const { data: rows, error: subError } = await supabase
    .from("group_taf_submissions")
    .select("group_id")
    .in("group_id", ids)
    .in("status", ["pending", "under_review"]);

  if (subError) {
    console.error("Error counting pending TAFs:", subError);
    return { success: false, error: "Failed to count pending TAFs." };
  }

  const counts: Record<string, number> = {};
  for (const r of (rows || []) as { group_id: string }[]) {
    counts[r.group_id] = (counts[r.group_id] || 0) + 1;
  }

  return { success: true, counts };
}

// ── Get students in a group (for advisers) ──────────────────────────

export type GroupStudent = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  srCode: string;
  /** Uploaded profile picture (public URL) — null when the student has none. */
  avatarUrl: string | null;
  joinedAt: string;
};

export type GroupStudentsResult =
  | { success: true; data: GroupStudent[] }
  | { success: false; error: string };

export async function getAdviserGroupStudents(
  groupId: string
): Promise<GroupStudentsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can view group members." };
  }

  const supabase = await createClient();

  // Verify the adviser owns this group
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .single();

  if (!group) {
    return { success: false, error: "Group not found or you don't have access." };
  }

  // Get members with their profile info (query separately since FK is to auth.users, not profiles)
  const { data: memberships, error } = await supabase
    .from("student_group_memberships")
    .select(`
      id,
      student_id,
      joined_at
    `)
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("Error fetching group students:", error);
    return { success: false, error: "Failed to fetch students. Please try again." };
  }

  if (memberships.length === 0) {
    return { success: true, data: [] };
  }

  // Batch-fetch profiles for the student IDs
  const studentIds = memberships.map((m) => m.student_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, middle_initial, sr_code, avatar_url")
    .in("id", studentIds);

  // Build a lookup map
  type ProfileRow = {
    first_name: string;
    last_name: string;
    middle_initial: string | null;
    sr_code: string;
    avatar_url: string | null;
  };
  const profileMap = new Map<string, ProfileRow>(
    (profiles || []).map((p) => [p.id as string, p as unknown as ProfileRow])
  );

  const students: GroupStudent[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.student_id);

    return {
      id: membership.id,
      studentId: membership.student_id,
      firstName: profile?.first_name || "Unknown",
      lastName: profile?.last_name || "Student",
      middleInitial: profile?.middle_initial || null,
      srCode: profile?.sr_code || "—",
      avatarUrl: profile?.avatar_url || null,
      joinedAt: membership.joined_at,
    };
  });

  return { success: true, data: students };
}

// ── Join a group using join code (for students) ─────────────────────────

export type JoinGroupResult =
  | { success: true; groupId: string; groupName: string; message: string }
  | { success: false; error: string };

export async function joinGroupByCode(joinCode: string): Promise<JoinGroupResult> {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: "You must be logged in to join a group." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can join advisory groups." };
  }

  const supabase = await createClient();

  // Server-side check: student can only join one group
  const { count: existingCount, error: countError } = await supabase
    .from("student_group_memberships")
    .select("*", { count: "exact", head: true })
    .eq("student_id", user.id);

  if (!countError && existingCount && existingCount > 0) {
    return { success: false, error: "You can only join one advisory group. Leave your current group first." };
  }

  // Call the database function to join the group
  // Note: join_advisory_group_by_code is RETURNS TABLE, so supabase-js may
  // return `data` as an array of one row rather than a plain object. Normalize
  // so `row.success` / `row.message` etc. always resolve correctly.
  const { data, error } = await supabase.rpc("join_advisory_group_by_code", {
    p_join_code: joinCode.toUpperCase(),
  });

  const row = (Array.isArray(data) ? data?.[0] : data) as
    | { success?: boolean; message?: string; out_group_id?: string; group_name?: string }
    | undefined;

  if (error) {
    console.error("Error joining group:", error);
    return { success: false, error: "Failed to join group. Please try again." };
  }

  if (!row || row.success === false || row.success === undefined) {
    return { success: false, error: row?.message || "Failed to join group. Please try again." };
  }

  // Notify the group's adviser that a student just joined (fires immediately,
  // so it shows in the adviser's bell / notifications page without a refresh).
  try {
    const groupId = row.out_group_id as string | undefined;
    const groupName = row.group_name as string | undefined;
    if (groupId) {
      const { data: group } = await supabase
        .from("advisory_groups")
        .select("adviser_id")
        .eq("id", groupId)
        .single();
      const adviserId = group?.adviser_id as string | undefined;
      if (adviserId) {
        const studentName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "A student";
        await supabase.from("approval_notifications").insert({
          user_id: adviserId,
          submission_id: null,
          group_id: groupId,
          group_name: groupName || null,
          type: "joined_group",
          message: `${studentName} joined your advisory group${groupName ? ` "${groupName}"` : ""}.`,
        });
      }
    }
  } catch (notifErr) {
    console.error("[advisory-groups] Failed to notify adviser of join:", notifErr);
  }

  await logAudit({
    action: "group_joined",
    category: "membership",
    entityType: "advisory_group",
    entityId: row.out_group_id as string,
    entityLabel: (row.group_name as string) || null,
    description: `Joined the advisory group "${row.group_name}".`,
  });

  return {
    success: true,
    groupId: row.out_group_id as string,
    groupName: row.group_name as string,
    message: row.message as string,
  };
}

// ── Leave an advisory group (for students) ──────────────────────
// Deletes ONLY the student's membership. Submitted TAFs are scoped by
// group_id + submitted_by and are NOT deleted — they remain visible to the
// adviser/approvers. Once the membership row is gone, the server-side access
// gates (`getStudentGroupBySlug`, `getSubmissionById`) deny the student any
// further access to the group and its submission pages.
export async function leaveAdvisoryGroup(
  groupId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to leave a group." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can leave advisory groups." };
  }

  const supabase = await createClient();

  // Verify the student is actually a member (defense: don't delete arbitrary rows).
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id, group_id")
    .eq("student_id", user.id)
    .eq("group_id", groupId)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "You are not a member of this group." };
  }

  // Remove the membership row (RLS allows a student to delete their own row).
  const { error } = await supabase
    .from("student_group_memberships")
    .delete()
    .eq("id", membership.id);

  if (error) {
    console.error("[advisory-groups] Error leaving group:", error);
    return { success: false, error: "Failed to leave the group. Please try again." };
  }

  // Audit trail: a student leaving an advisory group.
  await logAudit({
    action: "student_left_group",
    entityType: "advisory_group",
    entityId: groupId,
    description: "Left the advisory group.",
    metadata: { membershipId: membership.id },
  });

  // Notify the group's adviser that the student left (best-effort).
  try {
    const { data: group } = await supabase
      .from("advisory_groups")
      .select("adviser_id, name")
      .eq("id", groupId)
      .single();
    const adviserId = (group as { adviser_id?: string; name?: string } | null)?.adviser_id;
    const groupName = (group as { adviser_id?: string; name?: string } | null)?.name || null;
    if (adviserId) {
      const studentName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "A student";
      await supabase.from("approval_notifications").insert({
        user_id: adviserId,
        submission_id: null,
        group_id: groupId,
        group_name: groupName,
        type: "left_group",
        message: `${studentName} left your advisory group${groupName ? ` "${groupName}"` : ""}.`,
      });
    }
  } catch (notifErr) {
    console.error("[advisory-groups] Failed to notify adviser of leave:", notifErr);
  }

  return { success: true };
}

// ── Remove a student from an advisory group (for advisers) ─────────────
// Deletes ONLY the student's membership row for that group. Anything the
// student already submitted lives in group_taf_submissions (keyed by
// group_id + submitted_by) and is deliberately left alone, so the adviser
// keeps the submission and its approval trail. The student is notified.
//
// Requires migration 043: the adviser DELETE policy on
// student_group_memberships, plus the 'removed_from_group' notification type.
export async function removeStudentFromGroup(
  groupId: string,
  studentId: string
): Promise<{ success: true; studentName: string } | { success: false; error: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can remove students from a group." };
  }

  const supabase = await createClient();

  // Verify the adviser owns this group before touching anything.
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("id, name")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .maybeSingle();

  if (!group) {
    return { success: false, error: "Group not found or you don't have access." };
  }

  // Confirm the membership exists so a stale UI click can't report success.
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "That student is not in this group." };
  }

  // Name for the toast + notification (profiles FK is to auth.users, so this
  // is a separate lookup).
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();
  const studentName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "The student";

  const { error } = await supabase
    .from("student_group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("student_id", studentId);

  if (error) {
    console.error("[advisory-groups] Error removing student from group:", error);
    return {
      success: false,
      error: "Failed to remove the student. Please try again.",
    };
  }

  // Best-effort notification — never fail the removal because of this.
  try {
    await supabase.from("approval_notifications").insert({
      user_id: studentId,
      submission_id: null,
      group_id: groupId,
      group_name: (group as { name?: string }).name || null,
      type: "removed_from_group",
      message: `You were removed from the advisory group "${(group as { name?: string }).name}". Any TAF you already submitted stays with your adviser.`,
    });
  } catch (notifErr) {
    console.error("[advisory-groups] Failed to notify student of removal:", notifErr);
  }

  await logAudit({
    action: "student_removed_from_group",
    category: "membership",
    entityType: "advisory_group",
    entityId: groupId,
    entityLabel: (group as { name?: string }).name || null,
    description: `Removed ${studentName} from the advisory group "${
      (group as { name?: string }).name ?? ""
    }".`,
  });

  return { success: true, studentName };
}

// ── Get all groups the current student has joined ─────────────────────────

export type StudentGroupMembership = {
  id: string;
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  joinCode: string;
  /**
   * false = the adviser archived the group.
   *
   * A member keeps READ access to an archived group (migration 065) so they can
   * review what was already submitted; the group becomes read-only and the only
   * action they have is Leave, which frees them to join the next group.
   */
  isActive: boolean;
  joinedAt: string;
  adviserId: string;
};

export type StudentGroupsResult =
  | { success: true; data: StudentGroupMembership[] }
  | { success: false; error: string };

export async function getStudentJoinedGroups(): Promise<StudentGroupsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to view your groups." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can view their joined groups." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("student_group_memberships")
    .select(`
      id,
      joined_at,
      group_id,
      advisory_groups!inner (
        name,
        description,
        join_code,
        adviser_id,
        is_active
      )
    `)
    .eq("student_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    console.error("Error fetching student groups:", error);
    return { success: false, error: "Failed to fetch your groups. Please try again." };
  }

  const groups: StudentGroupMembership[] = data.map((membership) => ({
    id: membership.id,
    groupId: membership.group_id,
    groupName: (membership.advisory_groups as unknown as { name: string }).name,
    groupDescription: (membership.advisory_groups as unknown as { description: string | null }).description,
    joinCode: (membership.advisory_groups as unknown as { join_code: string }).join_code,
    joinedAt: membership.joined_at,
    adviserId: (membership.advisory_groups as unknown as { adviser_id: string }).adviser_id,
    isActive: (membership.advisory_groups as unknown as { is_active: boolean }).is_active,
  }));

  return { success: true, data: groups };
}

// ── Get group detail for a student (by group ID, only if they're a member) ─

export type StudentGroupDetailResult =
  | { success: true; data: StudentGroupMembership & { adviserName: string; memberCount: number } }
  | { success: false; error: string };

// ── Slugify helper ─────────────────────────────────────────
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── Get advisory group by slug (for adviser) ─────────────────
export async function getAdviserGroupBySlug(
  slug: string
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (!canOwnAdvisoryGroup(user.role)) {
    return { success: false, error: "Only advisers, the associate dean, the dean and the department can access this." };
  }

  // A single group is a READ of the group surface: a department account
  // without groups.view must not open one by slug either. Its route
  // (…/groups/<slug>) turns this failure into a redirect to ?section=groups,
  // which renders the no-access notice.
  if (await departmentBlocked(user.role, user.id, "groups.view")) {
    return { success: false, error: departmentDeniedMessage("view", "groups.view") };
  }

  const supabase = await createClient();

  // Fetch all groups for this adviser and match by slugified name
  const { data, error } = await supabase
    .from("advisory_groups")
    .select("*")
    .eq("adviser_id", user.id);

  if (error) {
    console.error("Error fetching advisory groups:", error);
    return { success: false, error: "Failed to fetch advisory groups." };
  }

  const group = data.find((g) => slugify(g.name) === slug);

  if (!group) {
    return { success: false, error: "Advisory group not found." };
  }

  return {
    success: true,
    data: {
      id: group.id,
      adviserId: group.adviser_id,
      name: group.name,
      description: group.description,
      joinCode: group.join_code,
      isActive: group.is_active,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    },
  };
}

// ── Get group detail by slug (for student) ─────────────────
export async function getStudentGroupBySlug(
  slug: string
): Promise<StudentGroupDetailResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can access this." };
  }

  // Get all joined groups and find the one with matching slug
  const groupsResult = await getStudentJoinedGroups();
  if (!groupsResult.success) {
    return { success: false, error: groupsResult.error };
  }

  const match = groupsResult.data.find((g) => slugify(g.groupName) === slug);
  if (!match) {
    return { success: false, error: "Group not found." };
  }

  // Use existing detail loader with the group ID
  return await getStudentGroupDetail(match.groupId);
}

// ── Get group detail for a student (by group ID, only if they're a member) ─

export async function getStudentGroupDetail(
  groupId: string
): Promise<StudentGroupDetailResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to view group details." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can view group details from this context." };
  }

  const supabase = await createClient();

  // Verify the student is a member of this group
  const { data: membership, error: membershipError } = await supabase
    .from("student_group_memberships")
    .select(`
      id,
      joined_at,
      group_id,
      advisory_groups!inner (
        name,
        description,
        join_code,
        adviser_id,
        is_active
      )
    `)
    .eq("student_id", user.id)
    .eq("group_id", groupId)
    .single();

  if (membershipError || !membership) {
    return { success: false, error: "Group not found or you're not a member of this group." };
  }

  const groupData = membership.advisory_groups as unknown as {
    name: string;
    description: string | null;
    join_code: string;
    adviser_id: string;
    is_active: boolean;
  };

  // Get adviser name from profiles, fall back to auth metadata
  let adviserName = "Unknown Adviser";
  const { data: adviserProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", groupData.adviser_id)
    .maybeSingle();

  if (adviserProfile) {
    adviserName = `${adviserProfile.first_name} ${adviserProfile.last_name}`.trim();
  } else {
    // Fallback: look up auth user metadata via RPC
    const { data: displayName } = await supabase.rpc("get_user_display_name", {
      user_id: groupData.adviser_id,
    });
    if (displayName) {
      adviserName = displayName;
    }
  }

  // Get member count (use RPC to bypass RLS)
  const { data: memberCount } = await supabase
    .rpc("get_group_member_count", { p_group_id: groupId });
  const count = (typeof memberCount === "number") ? memberCount : 0;

  return {
    success: true,
    data: {
      id: membership.id,
      groupId: membership.group_id,
      groupName: groupData.name,
      groupDescription: groupData.description,
      joinCode: groupData.join_code,
      joinedAt: membership.joined_at,
      adviserId: groupData.adviser_id,
      isActive: groupData.is_active,
      adviserName,
      memberCount: count,
    },
  };
}

// ── Get group member roster (for a student in the group) ─────────────
// Uses a SECURITY DEFINER RPC so a group's members can see their roster
// even though the table RLS only lets a student SELECT their own row.

export type StudentGroupMember = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  srCode: string;
  joinedAt: string;
};

export type StudentGroupMembersResult =
  | { success: true; data: StudentGroupMember[] }
  | { success: false; error: string };

export async function getStudentGroupMembers(
  groupId: string
): Promise<StudentGroupMembersResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can view group members." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_group_members", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("Error fetching group members:", error);
    return { success: false, error: "Failed to fetch group members." };
  }

  const members: StudentGroupMember[] = (data || []).map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    firstName: r.first_name || "",
    lastName: r.last_name || "",
    middleInitial: r.middle_initial || null,
    srCode: r.sr_code || "",
    joinedAt: r.joined_at,
  }));

  return { success: true, data: members };
}
