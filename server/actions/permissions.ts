"use server";

import { cache } from "react";

// ============================================================
// Permissions — the app-side reader/writer for the permission layer.
//
// The DATABASE is the single source of truth and this file re-declares NOTHING:
//   public.permissions              — the catalogue (key, label, structural…)
//   public.role_default_permissions — what each role gets out of the box
//   public.user_permissions         — per-account DEVIATIONS only
// (migrations 053 / 054). Adding a permission is a migration, not a code edit,
// so the app and RLS can never disagree about what a role gets.
//
// Resolution order for one account — identical to public.has_permission():
//   1. an explicit row in user_permissions → true = GRANT, false = DENY
//   2. the account's role default
//   3. false
// A DENY therefore beats the role default. The writers below only ever store
// DEVIATIONS: a value that matches the role default is stored as `null`, which
// DELETES the row, so a later role change cannot leave a stale grant behind.
// ============================================================

import { createClient } from "@/server/supabase/server";
import { logAudit } from "@/server/audit";
import { USER_ROLES, type UserRole } from "@/lib/constants";
import { getCurrentUser } from "./auth";

// ── Types ────────────────────────────────────────────────────

export type PermissionResult =
  | { success: true }
  | { success: false; error: string };

/** One catalogue row, exactly as public.permissions stores it. */
export type PermissionItem = {
  key: string;
  label: string;
  description: string | null;
  /**
   * Structural permissions change WHO approves, not just what is visible.
   * Read from the table — callers must never hardcode which keys these are.
   */
  structural: boolean;
  /**
   * RESERVED permissions belong to department accounts alone (user management,
   * journal uploads, feedback replies — migration 058). Read from the table so
   * the UI cannot disagree with the trigger that enforces it; a caller must
   * never hardcode which keys these are.
   */
  department_only: boolean;
  /**
   * WHICH ROLES may hold this key at all (migration 060). `null` = every role.
   * A row outside this list is never offered in the dialog and is refused by
   * setUserPermission(), because the surface it grants does not exist for that
   * role — offering it produced a nav item that dead-ended.
   */
  applies_to: string[] | null;
  /**
   * The roles for which this key IS the account type's own function (migration
   * 060): an adviser creates advisory groups and sits in the approval chain by
   * definition. Such a row renders CHECKED AND LOCKED, and no override row may
   * exist for it.
   */
  fixed_roles: string[];
};

export type PermissionGroup = {
  group: string;
  permissions: PermissionItem[];
};

/**
 * The effective access of ONE account plus the keys it holds as explicit
 * overrides, so the UI can mark them as differing from the role default.
 */
export type UserPermissionState = {
  effective: Record<string, boolean>;
  overrides: Record<string, true | false>;
};

/**
 * One access change, as the department console submits it.
 * `granted: null` means "no override" — delete the row, restore the role default.
 */
export type PermissionChange = {
  permission: string;
  granted: boolean | null;
};

// ── Display grouping ─────────────────────────────────────────

// Sections are derived from each key's NAMESPACE (the part before the first
// dot), never from a hardcoded list of keys: a permission added to the
// catalogue tomorrow lands in the right section with no code change.
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

// Order the sections appear in. Anything unmapped sorts last (alphabetically),
// so an unknown namespace can never hide above the real ones.
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

/** "my_thing.view" → "My Thing" when the namespace isn't mapped yet. */
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

// ── Reads ────────────────────────────────────────────────────

/**
 * The permission catalogue, grouped for the UI. Read straight from
 * public.permissions — the table is the only place a permission can be invented.
 */
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

/**
 * EVERYTHING the department console's Users dialog needs, in ONE round trip:
 * the catalogue, every role's defaults, and every account's override rows.
 *
 * The dialog used to open with a spinner of its own: the page fired
 * getUserPermissionState() on click, so the checkboxes appeared a beat after the
 * form (and, before the catalogue/defaults had landed, painted UNCHECKED — which
 * reads as "this adviser has nothing"). Preloading all of it with the page
 * bundle makes the boxes correct on the first paint of the dialog, with no
 * per-click round trip and no effect syncing state afterwards.
 *
 * Overrides are DEVIATIONS only (a role default is never stored), so this map
 * is small even with hundreds of accounts.
 */
export type PermissionConsoleData = {
  groups: PermissionGroup[];
  roleDefaults: Record<string, string[]>;
  /** user id → { permission key: explicit grant (true) or deny (false) }. */
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

/**
 * Catalogue + every role default + every account's override rows.
 * Memoised per request so the department page and the edit dialog share ONE read.
 */
export async function readPermissionConsoleData(): Promise<PermissionConsoleData> {
  return loadPermissionConsoleData();
}

/**
 * The effective permission set for an account is resolved by
 * `resolvePermissionState()` in lib/permissions.ts — the pure copy of the rule,
 * shared by the dialog (render time) and this module (write time). It cannot
 * live here: a "use server" module may only export async functions.
 */

/** The permission keys a role gets by default (public.role_default_permissions). */
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

/**
 * Every role's defaults in one round trip, keyed by role. The dialog needs the
 * defaults of the role CURRENTLY SELECTED in the form (the department can change
 * a role and the permissions in the same save), so a single role's list is not
 * enough — and fetching per role change would mean state in an effect.
 */
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

/**
 * The effective access of one account (`effective`) plus the keys it holds as
 * explicit override rows (`overrides`), resolved with the SAME order as
 * public.has_permission(): override → role default → false.
 */
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
    // An explicit row is a GRANT when true and a DENY when false.
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
  // A row whose key is no longer in the catalogue still applies (the FK makes
  // that unlikely) — reporting it keeps the dialog from silently disagreeing
  // with public.has_permission().
  for (const key of Object.keys(overrides)) {
    if (!(key in effective)) effective[key] = overrides[key];
  }

  return { effective, overrides };
}

/**
 * The permission KEYS an account effectively HOLDS (value `true`), for callers
 * that need a plain list rather than the whole state — notably the side nav,
 * whose `permissions` argument is `string[]`.
 *
 * Derived from getUserPermissionState, so it resolves with the exact same
 * override → role default → false order as public.has_permission(): a key that
 * is false here is a key RLS will also refuse. One call, one source.
 */
// Memoised per request: a page render asks for the same account's grants from
// the shell, the page guard and any child that builds a nav. Request scope means
// a grant/revoke still bites on the very next request — no TTL, no invalidation.
const loadGrantedPermissions = cache(
  async (userId: string): Promise<string[]> => {
    const { effective } = await getUserPermissionState(userId);
    return Object.keys(effective).filter((key) => effective[key] === true);
  },
);

export async function getGrantedPermissions(userId: string): Promise<string[]> {
  return loadGrantedPermissions(userId);
}

/**
 * The signed-in account's own granted keys.
 *
 * For the client surfaces that render the shared SIDE NAV but load no data of
 * their own (the adviser's profile page, a group's detail page): nav items carry
 * icon ELEMENTS, so they must be built in the browser, and the browser needs the
 * grants without a userId in hand. [] when signed out — never throws.
 */
const loadMyGrantedPermissions = cache(async (): Promise<string[]> => {
  const supabase = await createClient();

  // ONE round trip: public.my_permissions() (migration 054) resolves the whole
  // set server-side with the same order has_permission() uses. The multi-query
  // resolver below this file is 4 round trips, which is fine once per page and
  // not fine inside every action that needs a yes/no answer.
  const { data, error } = await supabase.rpc("my_permissions");
  if (!error) {
    return ((data ?? []) as { permission: string }[]).map((row) => row.permission);
  }

  // The RPC missing (054 not applied) must not lock a role out of its own
  // queue: fall back to the table reads, which answer the same question.
  console.error("[permissions] my_permissions() failed, falling back:", error);
  const user = await getCurrentUser();
  if (!user) return [];
  return getGrantedPermissions(user.id);
});

/** The signed-in account's grants, memoised for this request. */
export async function getMyGrantedPermissions(): Promise<string[]> {
  return loadMyGrantedPermissions();
}

// ── Write ────────────────────────────────────────────────────

/** Shown when a department account tries to change its OWN access. */
const SELF_EDIT_ERROR =
  "You cannot change your own permissions. Ask another department account to do it — no account may widen its own access.";

/**
 * Shown when a RESERVED permission (public.permissions.department_only) is aimed
 * at an account whose role is not 'department'.
 */
const DEPARTMENT_ONLY_ERROR =
  "User management, journal uploads and feedback replies are reserved for department accounts and cannot be granted to other roles.";

/** Human name for a role, for the two scope messages below. */
function roleLabel(role: string): string {
  return USER_ROLES[role as UserRole] ?? role ?? "this";
}

/**
 * Set, or clear, one account's access to one permission.
 *
 *   granted = true  → explicit GRANT (override row)
 *   granted = false → explicit DENY  (beats the role default)
 *   granted = null  → DELETE the override, restoring the role default
 *
 * Department-only, and never for the acting account itself.
 *
 * A permission marked `department_only` in the catalogue is REFUSED here unless
 * the target account's role is 'department' — before any write, so the caller
 * gets this message rather than the trigger's raw 42501.
 */
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
  // A department account must never hand itself more access than it already
  // has: the permission layer's only admin cannot widen (or narrow) itself.
  if (userId === actor.id) {
    return { success: false, error: SELF_EDIT_ERROR };
  }

  const key = (permission ?? "").trim();
  if (!key) {
    return { success: false, error: "No permission was specified." };
  }

  const supabase = await createClient();

  // The catalogue is the single source of valid keys — a typo must never create
  // a permission no other surface knows how to honour.
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

  // A RESERVED permission (department_only in public.permissions — user
  // management, journal uploads, feedback replies) may only ever sit on a
  // department account. Migration 058 enforces that with a trigger that raises
  // 42501; refusing FIRST means the department sees this sentence instead of a
  // raw driver error. `granted === null` is a DELETE (reset to the role
  // default), which cannot create a violation — it is also the way an existing
  // row on an old account gets cleaned up — so it stays allowed.
  const reserved =
    (known as { department_only?: boolean | null }).department_only === true;
  if (reserved && targetRole !== "department" && granted !== null) {
    return { success: false, error: DEPARTMENT_ONLY_ERROR };
  }

  // `applies_to` (migration 060): the key must have a surface the target's role
  // can actually open. Granting it anyway is what put a department URL in an
  // adviser's side nav — a link the middleware bounces.
  const appliesTo = (known as { applies_to?: string[] | null }).applies_to ?? null;
  if (appliesTo && granted !== null && !appliesTo.includes(targetRole)) {
    return {
      success: false,
      error: `"${label}" is not available to ${roleLabel(targetRole)} accounts, so it cannot be granted to this account.`,
    };
  }

  // `fixed_roles` (migration 060): the key IS the account type's own function
  // (an adviser creates advisory groups; every chain role participates in
  // approvals). No override row may exist for it — grant or deny.
  const fixedRoles =
    (known as { fixed_roles?: string[] | null }).fixed_roles ?? [];
  if (granted !== null && fixedRoles.includes(targetRole)) {
    return {
      success: false,
      error: `"${label}" is part of the ${roleLabel(targetRole)} account type and cannot be granted or denied per account.`,
    };
  }

  // null → remove the override row entirely: the role default applies again
  // (and follows the role if it changes later).
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
    // The trigger in migration 058 raises 42501 if the account's role changed
    // between the read above and this write — surface the same sentence instead
    // of a bare "failed".
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
