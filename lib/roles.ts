/**
 * Roles that may own an advisory group.
 *
 * The associate dean and dean supervise students themselves, so they need
 * groups of their own — not just visibility. VCRDES does NOT: it stays in the
 * approval chain (see RULING_ROLES) but never owns or creates a group.
 *
 * The DEPARTMENT may own groups too: it is the CICS office that supervises
 * capstone students, so a group it created must be approvable by it. Note it is
 * still NOT in RULING_ROLES — the department has no level in the chain. For a
 * department-owned group the entry step is 'adviser', exactly as it is for an
 * associate-dean or dean owner, and the department's own decisions on later
 * steps are stand-ins (see approveSubmission).
 *
 * Ownership (`adviser_id`) is what makes a user the group's step-1 approver, so
 * this list is deliberately paired with the approval-workflow changes that:
 *   (a) let the group's owner approve the adviser step whatever their role, and
 *   (b) skip the owner's own role-level step, so one person never signs the
 *       same TAF twice.
 */
export const GROUP_OWNER_ROLES = [
  "adviser",
  "associate_dean",
  "dean",
  "department",
] as const;

/** Roles that sit in the approval chain (adviser is the entry level). */
export const RULING_ROLES = [
  "adviser",
  "associate_dean",
  "dean",
  "vcrdes",
] as const;

export function canOwnAdvisoryGroup(role: string | null | undefined): boolean {
  return !!role && (GROUP_OWNER_ROLES as readonly string[]).includes(role);
}

export function isRulingRole(role: string | null | undefined): boolean {
  return !!role && (RULING_ROLES as readonly string[]).includes(role);
}
