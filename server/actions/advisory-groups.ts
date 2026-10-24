"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";
import { logAudit } from "@/server/audit";

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

  isActive?: boolean;
};

export type AdvisoryGroupResult =
  | { success: true; data: AdvisoryGroup }
  | { success: false; error: string };

export type AdvisoryGroupsListResult =
  | { success: true; data: AdvisoryGroup[] }
  | { success: false; error: string };
export async function createAdvisoryGroup(
  input: CreateAdvisoryGroupInput
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to create an advisory group." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can create advisory groups." };
  }

  const name = input.name.trim();
  const description = input.description?.trim() || null;
  if (!name) {
    return { success: false, error: "Group name is required." };
  }

  if (name.length < 3) {
    return { success: false, error: "Group name must be at least 3 characters." };
  }

  if (name.length > 100) {
    return { success: false, error: "Group name must not exceed 100 characters." };
  }
  const DESCRIPTION_MAX = 500;
  if (description && description.length > DESCRIPTION_MAX) {
    return {
      success: false,
      error: `Description must not exceed ${DESCRIPTION_MAX} characters.`,
    };
  }

  const supabase = await createClient();

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
export async function getAdviserAdvisoryGroups(): Promise<AdvisoryGroupsListResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to view advisory groups." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can view advisory groups." };
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
export async function getAdvisoryGroupById(
  groupId: string
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to view this advisory group." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can view advisory groups." };
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
export async function updateAdvisoryGroup(
  input: UpdateAdvisoryGroupInput
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to update an advisory group." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can update advisory groups." };
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
    updates.description = input.description.trim() || null;
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
export async function deleteAdvisoryGroup(
  groupId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to delete an advisory group." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can delete advisory groups." };
  }

  const supabase = await createClient();
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
  await logAudit({
    action: "group_deleted",
    entityType: "advisory_group",
    entityId: groupId,
    entityLabel: groupName,
    description: `Deleted advisory group "${groupName ?? groupId}".`,
  });

  return { success: true };
}
export async function regenerateJoinCode(
  groupId: string
): Promise<{ success: true; newCode: string } | { success: false; error: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in to regenerate the join code." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can regenerate join codes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_group_join_code", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("Error regenerating join code:", error);
    return { success: false, error: "Failed to regenerate join code. Please try again." };
  }

  return { success: true, newCode: data };
}
export async function getAdviserTotalStudents(): Promise<
  { success: true; count: number } | { success: false; error: string }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can view this." };
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
export type GroupStudent = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  srCode: string;
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

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can view group members." };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .single();

  if (!group) {
    return { success: false, error: "Group not found or you don't have access." };
  }
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
  const studentIds = memberships.map((m) => m.student_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, middle_initial, sr_code")
    .in("id", studentIds);
  type ProfileRow = {
    first_name: string;
    last_name: string;
    middle_initial: string | null;
    sr_code: string;
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
      joinedAt: membership.joined_at,
    };
  });

  return { success: true, data: students };
}
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
  const { count: existingCount, error: countError } = await supabase
    .from("student_group_memberships")
    .select("*", { count: "exact", head: true })
    .eq("student_id", user.id);

  if (!countError && existingCount && existingCount > 0) {
    return { success: false, error: "You can only join one advisory group. Leave your current group first." };
  }
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

  return {
    success: true,
    groupId: row.out_group_id as string,
    groupName: row.group_name as string,
    message: row.message as string,
  };
}
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
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id, group_id")
    .eq("student_id", user.id)
    .eq("group_id", groupId)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "You are not a member of this group." };
  }
  const { error } = await supabase
    .from("student_group_memberships")
    .delete()
    .eq("id", membership.id);

  if (error) {
    console.error("[advisory-groups] Error leaving group:", error);
    return { success: false, error: "Failed to leave the group. Please try again." };
  }
  await logAudit({
    action: "student_left_group",
    entityType: "advisory_group",
    entityId: groupId,
    description: "Left the advisory group.",
    metadata: { membershipId: membership.id },
  });
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
export async function removeStudentFromGroup(
  groupId: string,
  studentId: string
): Promise<{ success: true; studentName: string } | { success: false; error: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can remove students from a group." };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("id, name")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .maybeSingle();

  if (!group) {
    return { success: false, error: "Group not found or you don't have access." };
  }
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "That student is not in this group." };
  }
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

  return { success: true, studentName };
}
export type StudentGroupMembership = {
  id: string;
  groupId: string;
  groupName: string;
  groupDescription: string | null;
  joinCode: string;
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
        adviser_id
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
  }));

  return { success: true, data: groups };
}
export type StudentGroupDetailResult =
  | { success: true; data: StudentGroupMembership & { adviserName: string; memberCount: number } }
  | { success: false; error: string };
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
export async function getAdviserGroupBySlug(
  slug: string
): Promise<AdvisoryGroupResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can access this." };
  }

  const supabase = await createClient();
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
  const groupsResult = await getStudentJoinedGroups();
  if (!groupsResult.success) {
    return { success: false, error: groupsResult.error };
  }

  const match = groupsResult.data.find((g) => slugify(g.groupName) === slug);
  if (!match) {
    return { success: false, error: "Group not found." };
  }
  return await getStudentGroupDetail(match.groupId);
}
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
        adviser_id
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
  };
  let adviserName = "Unknown Adviser";
  const { data: adviserProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", groupData.adviser_id)
    .maybeSingle();

  if (adviserProfile) {
    adviserName = `${adviserProfile.first_name} ${adviserProfile.last_name}`.trim();
  } else {

    const { data: displayName } = await supabase.rpc("get_user_display_name", {
      user_id: groupData.adviser_id,
    });
    if (displayName) {
      adviserName = displayName;
    }
  }
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
      adviserName,
      memberCount: count,
    },
  };
}
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