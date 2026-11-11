/**
 * Permission resolution — the ONE pure copy of the rule.
 *
 * public.has_permission() (migration 054) answers it in SQL; this answers it in
 * TypeScript with the same order, so the UI can render a checkbox without a
 * round trip:
 *
 *   1. an explicit row in user_permissions → true = GRANT, false = DENY
 *   2. the account's role default          → role_default_permissions
 *   3. false
 *
 * Lives in lib/ (NOT in server/actions/permissions.ts) on purpose: a
 * "use server" module may only export async functions, and this must stay
 * synchronous so a dialog can call it while rendering.
 */

export function resolvePermissionState({
  keys,
  roleDefaults,
  overrides,
}: {
  /** Every catalogue key (the full list, so a false is explicit). */
  keys: string[];
  /** The permission keys the account's role grants by default. */
  roleDefaults: string[];
  /** The account's override rows: true = grant, false = deny. */
  overrides: Record<string, boolean>;
}): Record<string, boolean> {
  const defaults = new Set(roleDefaults);
  const effective: Record<string, boolean> = {};
  for (const key of keys) {
    const override = overrides[key];
    effective[key] = override === undefined ? defaults.has(key) : override === true;
  }
  return effective;
}

/**
 * May this role hold this key at all? `applies_to` is NULL for "every role"
 * (migration 060), so an un-migrated catalogue still offers everything.
 */
export function permissionAppliesToRole(
  appliesTo: string[] | null | undefined,
  role: string,
): boolean {
  return !appliesTo || appliesTo.includes(role);
}

/**
 * Is this key part of the role's own account type — i.e. shown CHECKED AND
 * LOCKED rather than as a toggle? An adviser creates advisory groups and
 * approves TAFs by definition, so a checkbox for it is a lie.
 */
export function permissionFixedForRole(
  fixedRoles: string[] | null | undefined,
  role: string,
): boolean {
  return !!fixedRoles && fixedRoles.includes(role);
}
