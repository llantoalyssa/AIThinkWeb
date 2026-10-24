"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { logAudit } from "@/server/audit";
import { getCurrentUser } from "./auth";
import { type UserRole } from "@/lib/constants";
export type DepartmentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  suffix: string | null;
  srCode: string;
  role: UserRole;
  isActive: boolean;
  assignedAdviser: string | null;
};

export type CreateUserInput = {
  firstName: string;
  lastName: string;
  middleInitial?: string;
  suffix?: string;
  srCode?: string;
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
};

export type UpdateUserInput = {
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  suffix?: string;
  srCode?: string;
  role?: UserRole;
  isActive?: boolean;
};

export type DepartmentResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
const ROLES: UserRole[] = [
  "student",
  "adviser",
  "associate_dean",
  "dean",
  "department",
  "vcrdes",
];

const DEPARTMENT_NAME_RE = /^[\p{L} .'-]+$/u;
const DEPARTMENT_MIDDLE_RE = /^[\p{L}]{1,2}\.?$/u;
export async function getAllUsers(): Promise<
  DepartmentResult<DepartmentUser[]>
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can view all users." };
  }

  const supabase = await createClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, middle_initial, suffix, sr_code, role, is_active, updated_at")
    .order("last_name", { ascending: true });

  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    return { success: false, error: "Failed to fetch users." };
  }

  if (!profiles || profiles.length === 0) {
    return { success: true, data: [] };
  }
  const { data: memberships, error: membershipsError } = await supabase
    .from("student_group_memberships")
    .select("student_id, group_id, advisory_groups!inner(adviser_id, name)");

  if (membershipsError) {
    console.error("Error fetching memberships:", membershipsError);
  }
  type MembershipInfo = { adviserId: string; groupName: string };
  const studentGroupMap = new Map<string, MembershipInfo>();

  if (memberships) {
    for (const m of memberships) {
      const advGroup = m.advisory_groups as unknown as {
        adviser_id: string;
        name: string;
      };
      if (!studentGroupMap.has(m.student_id)) {
        studentGroupMap.set(m.student_id, {
          adviserId: advGroup.adviser_id,
          groupName: advGroup.name,
        });
      }
    }
  }
  const adviserIds = Array.from(studentGroupMap.values()).map((m) => m.adviserId);
  const adviserNameMap = new Map<string, string>();

  if (adviserIds.length > 0) {
    const { data: adviserProfiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", adviserIds);

    if (adviserProfiles) {
      for (const ap of adviserProfiles) {
        const name =
          `${(ap as any).first_name || ""} ${(ap as any).last_name || ""}`.trim();
        adviserNameMap.set((ap as any).id as string, name || "Unknown Adviser");
      }
    }
  }
  const users: DepartmentUser[] = profiles.map((profile) => {
    const pid = profile.id as string;
    const membership = studentGroupMap.get(pid);
    let assignedAdviser: string | null = null;

    if (membership) {
      assignedAdviser = adviserNameMap.get(membership.adviserId) || "Unknown Adviser";
    }

    return {
      id: pid,
      email: (profile as any).email || "",
      firstName: (profile as any).first_name || "",
      lastName: (profile as any).last_name || "",
      middleInitial: (profile as any).middle_initial || null,
      suffix: (profile as any).suffix || null,
      srCode: (profile as any).sr_code || "",
      role: ((profile as any).role as UserRole) || "student",
      isActive: (profile as any).is_active !== false,
      assignedAdviser,
    };
  });

  return { success: true, data: users };
}
export async function createUser(
  input: CreateUserInput
): Promise<DepartmentResult<{ userId: string; createdInactive?: boolean }>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can create users." };
  }
  if (!input.firstName || input.firstName.trim().length < 2) {
    return { success: false, error: "First name must be at least 2 characters." };
  }
  if (!DEPARTMENT_NAME_RE.test(input.firstName.trim())) {
    return { success: false, error: "First name can contain letters, spaces, hyphens, apostrophes and periods only." };
  }
  if (!input.lastName || input.lastName.trim().length < 2) {
    return { success: false, error: "Last name must be at least 2 characters." };
  }
  if (!DEPARTMENT_NAME_RE.test(input.lastName.trim())) {
    return { success: false, error: "Last name can contain letters, spaces, hyphens, apostrophes and periods only." };
  }
  if (input.middleInitial?.trim() && !DEPARTMENT_MIDDLE_RE.test(input.middleInitial.trim())) {
    return { success: false, error: "Middle initial must be 1–2 letters with an optional period." };
  }
  if (!input.email || !input.email.endsWith("@g.batstate-u.edu.ph")) {
    return { success: false, error: "Only @g.batstate-u.edu.ph email addresses are allowed." };
  }
  if (!input.password || input.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }
  if (!ROLES.includes(input.role)) {
    return { success: false, error: "Invalid role specified." };
  }
  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error:
        "User creation needs SUPABASE_SERVICE_ROLE_KEY. Add it to the server env (.env.local and Vercel), then retry.",
    };
  }
  const email = input.email.toLowerCase().trim();
  const role = input.role;
  const requestedActive = input.isActive ?? true;
  let effectiveActive = requestedActive;
  if (
    requestedActive &&
    ["vcrdes", "dean", "associate_dean"].includes(role)
  ) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("role", role)
      .eq("is_active", true)
      .limit(1);
    if (existing && existing.length > 0) effectiveActive = false;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      middle_initial: input.middleInitial?.trim() || null,
      suffix: input.suffix?.trim() || null,
      sr_code: (input.srCode && input.srCode.trim()) || null,
      role,
    },
  });

  if (error) {
    console.error("Error creating user:", error);
    const message = (error as { message?: string }).message || "";
    if (
      message.toLowerCase().includes("already exists") ||
      message.toLowerCase().includes("duplicate")
    ) {
      return { success: false, error: "A user with this email already exists." };
    }
    return { success: false, error: `Failed to create user: ${message}` };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { success: false, error: "Failed to create user." };
  }
  const { error: profErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      middle_initial: input.middleInitial?.trim() || null,
      suffix: input.suffix?.trim() || null,

      sr_code: (input.srCode && input.srCode.trim()) || null,
      role,
      is_active: effectiveActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profErr) {
    console.error("[createUser] Failed to ensure profile:", profErr);

    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }

    const msg = profErr.message || "";
    if (msg.includes("profiles_sr_code_key") || msg.toLowerCase().includes("sr_code")) {
      return {
        success: false,
        error: "That SR Code is already used by another account. Field is required for students only — leave it blank for staff roles.",
      };
    }
    return {
      success: false,
      error: `Account was rolled back because the profile could not be saved: ${msg}`,
    };
  }
  await logAudit({
    action: "account_created",
    entityType: "user",
    entityId: userId,
    entityLabel:
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
      input.email,
    description: `Created a ${input.role || "student"} account for ${input.email}.`,
    metadata: {
      role: input.role || "student",
      srCode: input.srCode ?? null,
      createdInactive: !effectiveActive,
    },
  });

  return { success: true, data: { userId, createdInactive: !effectiveActive } };
}
export async function updateUser(
  userId: string,
  input: UpdateUserInput
): Promise<DepartmentResult<null>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can update users." };
  }
  if (userId === user.id) {
    return {
      success: false,
      error:
        "You cannot edit your own account. Use your Profile page for your own details.",
    };
  }

  if (input.role && !ROLES.includes(input.role)) {
    return { success: false, error: "Invalid role specified." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("department_update_user", {
    p_user_id: userId,
    p_first_name: input.firstName?.trim() || null,
    p_last_name: input.lastName?.trim() || null,
    p_middle_initial: input.middleInitial?.trim() || null,
    p_suffix: input.suffix?.trim() || null,
    p_sr_code: input.srCode?.trim() || null,
    p_role: input.role || null,
    p_is_active: input.isActive ?? null,
  });

  if (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Failed to update user. Please try again." };
  }

  const rawRes = Array.isArray(data) ? data[0] : data;
  const result = (rawRes || {}) as { success: boolean; message: string };

  if (!result.success) {
    return { success: false, error: result.message };
  }

  return { success: true, data: null };
}
export async function deleteUser(
  userId: string
): Promise<DepartmentResult<null>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can delete users." };
  }
  if (userId === user.id) {
    return { success: false, error: "You cannot delete your own account." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("department_delete_user", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Failed to delete user. Please try again." };
  }

  const rawRes = Array.isArray(data) ? data[0] : data;
  const result = (rawRes || {}) as { success: boolean; message: string };

  if (!result.success) {
    return { success: false, error: result.message };
  }

  return { success: true, data: null };
}