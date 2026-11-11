"use server";

import { cache } from "react";
import { createClient } from "@/server/supabase/server";
import { logAudit } from "@/server/audit";
import { USER_ROLES, type UserRole } from "@/lib/constants";
import { getCurrentUser } from "./auth";
export type PermissionResult =
  | { success: true }
  | { success: false; error: string };
export type PermissionItem = {
  key: string;
  label: string;
  description: string | null;
  structural: boolean;
  department_only: boolean;
  applies_to: string[] | null;
  fixed_roles: string[];
};

export type PermissionGroup = {
  group: string;
  permissions: PermissionItem[];
};
export type UserPermissionState = {
  effective: Record<string, boolean>;
  overrides: Record<string, true | false>;
};
export type PermissionChange = {
  permission: string;
  granted: boolean | null;
};
const GROUP_LABELS: Record<string, string> = {
  groups: "Advisory Groups",
  approval: "Approvals",
  analytics: "Analytics",
  executive_summary: "Reports & Analytics",
  taf: "Reports & Analytics",
  pages: "Pages",
  users: "User Accounts",
  journals: "Journals",
  feedback: "Feedback",
};
const GROUP_ORDER = [
  "Advisory Groups",
  "Approvals",
  "Reports & Analytics",
  "Analytics",
  "Pages",
  "User Accounts",
  "Journals",
  "Feedback",
];
function groupLabelFor(key: string): string {
  const namespace = key.split(".")[0] || key;
  const mapped = GROUP_LABELS[namespace];
  if (mapped) return mapped;
  const humanised = namespace
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return humanised || "Other";
}

function groupCatalogue(rows: PermissionItem[]): PermissionGroup[] {
  const buckets = new Map<string, PermissionItem[]>();
  for (const row of rows) {
    const label = groupLabelFor(row.key);
    const bucket = buckets.get(label);
    if (bucket) bucket.push(row);
    else buckets.set(label, [row]);
  }

  const groups: PermissionGroup[] = [];
  buckets.forEach((permissions, group) => {
    groups.push({
      group,
      permissions: permissions.sort((a, b) => a.label.localeCompare(b.label)),
    });
  });

  groups.sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(a.group);
    const bIndex = GROUP_ORDER.indexOf(b.group);
    if (aIndex !== bIndex) {
      return (
        (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
        (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
      );
    }
    return a.group.localeCompare(b.group);
  });

  return groups;
}
export async function readPermissionCatalogue(): Promise<PermissionGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permissions")
    .select("key, label, description, structural, department_only, applies_to, fixed_roles")
    .order("key", { ascending: true });

  if (error) {
    console.error("[permissions] could not read the catalogue:", error);
    return [];
  }

  return groupCatalogue((data ?? []) as PermissionItem[]);
}
export type PermissionConsoleData = {
  groups: PermissionGroup[];
  roleDefaults: Record<string, string[]>;

  overridesByUser: Record<string, Record<string, boolean>>;
};

const loadPermissionConsoleData = cache(
  async (): Promise<PermissionConsoleData> => {
  const supabase = await createClient();

  const [groups, roleDefaults, overridesRes] = await Promise.all([
    readPermissionCatalogue(),
    readAllRoleDefaults(),
    supabase.from("user_permissions").select("user_id, permission, granted"),
  ]);

  if (overridesRes.error) {
    console.error(
      "[permissions] could not read the per-account overrides:",
      overridesRes.error,
    );
  }

  const overridesByUser: Record<string, Record<string, boolean>> = {};
  for (const row of (overridesRes.data ?? []) as {
    user_id: string;
    permission: string;
    granted: boolean;
  }[]) {
    const bucket = overridesByUser[row.user_id] ?? (overridesByUser[row.user_id] = {});
    bucket[row.permission] = row.granted === true;
  }

  return { groups, roleDefaults, overridesByUser };
  },
);
export async function readPermissionConsoleData(): Promise<PermissionConsoleData> {
  return loadPermissionConsoleData();
}
export async function readRoleDefaults(role: string): Promise<string[]> {
  if (!role) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_default_permissions")
    .select("permission")
    .eq("role", role);

  if (error) {
    console.error("[permissions] could not read the role defaults:", error);
    return [];
  }

  return ((data ?? []) as { permission: string }[]).map((row) => row.permission);
}
export async function readAllRoleDefaults(): Promise<Record<string, string[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_default_permissions")
    .select("role, permission");

  if (error) {
    console.error("[permissions] could not read the role defaults:", error);
    return {};
  }

  const byRole: Record<string, string[]> = {};
  for (const row of (data ?? []) as { role: string; permission: string }[]) {
    const bucket = byRole[row.role];
    if (bucket) bucket.push(row.permission);
    else byRole[row.role] = [row.permission];
  }
  return byRole;
}
export async function getUserPermissionState(
  userId: string,
): Promise<UserPermissionState> {
  if (!userId) return { effective: {}, overrides: {} };

  const supabase = await createClient();

  const [catalogue, profileRes, overridesRes] = await Promise.all([
    readPermissionCatalogue(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("user_permissions")
      .select("permission, granted")
      .eq("user_id", userId),
  ]);

  if (overridesRes.error) {
    console.error(
      "[permissions] could not read this account's overrides:",
      overridesRes.error,
    );
  }
  if (profileRes.error) {
    console.error(
      "[permissions] could not read this account's role:",
      profileRes.error,
    );
  }

  const overrides: Record<string, true | false> = {};
  for (const row of (overridesRes.data ?? []) as {
    permission: string;
    granted: boolean;
  }[]) {

    overrides[row.permission] = row.granted === true;
  }

  const role = (profileRes.data as { role?: string } | null)?.role ?? "";
  const defaults = new Set(role ? await readRoleDefaults(role) : []);

  const effective: Record<string, boolean> = {};
  for (const group of catalogue) {
    for (const item of group.permissions) {
      const override = overrides[item.key];
      effective[item.key] =
        override === undefined ? defaults.has(item.key) : override;
    }
  }
  for (const key of Object.keys(overrides)) {
    if (!(key in effective)) effective[key] = overrides[key];
  }

  return { effective, overrides };
}
const loadGrantedPermissions = cache(
  async (userId: string): Promise<string[]> => {
    const { effective } = await getUserPermissionState(userId);
    return Object.keys(effective).filter((key) => effective[key] === true);
  },
);

export async function getGrantedPermissions(userId: string): Promise<string[]> {
  return loadGrantedPermissions(userId);
}
const loadMyGrantedPermissions = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_permissions");
  if (!error) {
    return ((data ?? []) as { permission: string }[]).map((row) => row.permission);
  }
  console.error("[permissions] my_permissions() failed, falling back:", error);
  const user = await getCurrentUser();
  if (!user) return [];
  return getGrantedPermissions(user.id);
});
export async function getMyGrantedPermissions(): Promise<string[]> {
  return loadMyGrantedPermissions();
}
const SELF_EDIT_ERROR =
  "You cannot change your own permissions. Ask another department account to do it — no account may widen its own access.";
const DEPARTMENT_ONLY_ERROR =
  "User management, journal uploads and feedback replies are reserved for department accounts and cannot be granted to other roles.";
function roleLabel(role: string): string {
  return USER_ROLES[role as UserRole] ?? role ?? "this";
}
export async function setUserPermission(
  userId: string,
  permission: string,
  granted: boolean | null,
): Promise<PermissionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { success: false, error: "You must be logged in." };
  if (actor.role !== "department") {
    return {
      success: false,
      error: "Only department accounts can change permissions.",
    };
  }
  if (!userId) {
    return { success: false, error: "No account was specified." };
  }
  if (userId === actor.id) {
    return { success: false, error: SELF_EDIT_ERROR };
  }

  const key = (permission ?? "").trim();
  if (!key) {
    return { success: false, error: "No permission was specified." };
  }

  const supabase = await createClient();
  const { data: known, error: knownError } = await supabase
    .from("permissions")
    .select("key, label, department_only, applies_to, fixed_roles")
    .eq("key", key)
    .maybeSingle();
  if (knownError) {
    console.error("[permissions] could not verify the permission:", knownError);
    return {
      success: false,
      error: "Failed to verify the permission. Please try again.",
    };
  }
  if (!known) {
    return { success: false, error: `"${key}" is not a known permission.` };
  }

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) {
    console.error("[permissions] could not load the target account:", targetError);
    return {
      success: false,
      error: "Failed to load that account. Please try again.",
    };
  }
  if (!target) {
    return { success: false, error: "That account no longer exists." };
  }

  const targetEmail = (target as { email?: string | null }).email ?? "this account";
  const label = (known as { label?: string }).label ?? key;
  const targetRole = (target as { role?: string | null }).role ?? "";
  const reserved =
    (known as { department_only?: boolean | null }).department_only === true;
  if (reserved && targetRole !== "department" && granted !== null) {
    return { success: false, error: DEPARTMENT_ONLY_ERROR };
  }
  const appliesTo = (known as { applies_to?: string[] | null }).applies_to ?? null;
  if (appliesTo && granted !== null && !appliesTo.includes(targetRole)) {
    return {
      success: false,
      error: `"${label}" is not available to ${roleLabel(targetRole)} accounts, so it cannot be granted to this account.`,
    };
  }
  const fixedRoles =
    (known as { fixed_roles?: string[] | null }).fixed_roles ?? [];
  if (granted !== null && fixedRoles.includes(targetRole)) {
    return {
      success: false,
      error: `"${label}" is part of the ${roleLabel(targetRole)} account type and cannot be granted or denied per account.`,
    };
  }
  if (granted === null) {
    const { error } = await supabase
      .from("user_permissions")
      .delete()
      .eq("user_id", userId)
      .eq("permission", key);

    if (error) {
      console.error("[permissions] could not clear the override:", error);
      return {
        success: false,
        error: "Failed to reset the permission. Please try again.",
      };
    }

    await logAudit({
      action: "account_updated",
      entityType: "user",
      entityId: userId,
      entityLabel: targetEmail,
      description: `Reset "${label}" to the role default for ${targetEmail}.`,
      metadata: { permission: key, granted: null, actorId: actor.id },
    });

    return { success: true };
  }

  const { error } = await supabase.from("user_permissions").upsert(
    {
      user_id: userId,
      permission: key,
      granted,
      granted_by: actor.id,
      granted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,permission" },
  );

  if (error) {
    console.error("[permissions] could not save the override:", error);
    if (error.code === "42501") {
      return { success: false, error: DEPARTMENT_ONLY_ERROR };
    }
    return {
      success: false,
      error: "Failed to save the permission. Please try again.",
    };
  }

  await logAudit({
    action: "account_updated",
    entityType: "user",
    entityId: userId,
    entityLabel: targetEmail,
    description: granted
      ? `Granted "${label}" to ${targetEmail}.`
      : `Denied "${label}" for ${targetEmail} (beats the role default).`,
    metadata: { permission: key, granted, actorId: actor.id },
  });

  return { success: true };
}