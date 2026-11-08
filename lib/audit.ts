// ============================================================
// Audit trail catalogue — shared by the logger (server) and the
// Audit Trail page's filters (client), so labels can never drift.
//
// Adding an event type = add a label here + call logAudit() with it.
// No migration needed: audit_logs.action is free text.
// ============================================================

export const AUDIT_ACTIONS = {
  // ── Authentication ────────────────────────────────────────────────
  login: "Signed in",
  login_google: "Signed in with Google",
  logout: "Signed out",
  password_reset: "Reset their password",

  // ── Submissions ───────────────────────────────────────────────────
  taf_submitted: "Submitted a TAF",
  taf_resubmitted: "Resubmitted a TAF",
  taf_unsubmitted: "Withdrew a TAF submission",
  taf_approved: "Approved a TAF",
  taf_returned: "Returned a TAF for revision",

  // ── Deletions ─────────────────────────────────────────────────────
  taf_deleted: "Deleted a TAF",
  group_deleted: "Deleted an advisory group",
  user_deleted: "Deleted an account",
  journal_deleted: "Deleted a journal",
  feedback_deleted: "Deleted feedback",

  // ── Accounts ──────────────────────────────────────────────────────
  account_created: "Created an account",
  account_registered: "Registered an account",
  account_updated: "Updated an account",

  // ── Membership ────────────────────────────────────────────────────
  group_created: "Created an advisory group",
  group_joined: "Joined an advisory group",
  student_left_group: "Left an advisory group",
  student_removed_from_group: "Removed a student from a group",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_CATEGORIES = {
  auth: "Authentication",
  submission: "Submissions",
  deletion: "Deletions",
  account: "Accounts",
  membership: "Membership",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

/** Which category each action belongs to (drives the filter dropdown). */
export const ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  login: "auth",
  login_google: "auth",
  logout: "auth",
  password_reset: "auth",
  taf_submitted: "submission",
  taf_resubmitted: "submission",
  taf_unsubmitted: "submission",
  taf_approved: "submission",
  taf_returned: "submission",
  taf_deleted: "deletion",
  group_deleted: "deletion",
  user_deleted: "deletion",
  journal_deleted: "deletion",
  feedback_deleted: "deletion",
  account_created: "account",
  account_registered: "account",
  account_updated: "account",
  group_created: "membership",
  group_joined: "membership",
  student_left_group: "membership",
  student_removed_from_group: "membership",
};

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

export function auditCategoryLabel(category: string): string {
  return (AUDIT_CATEGORIES as Record<string, string>)[category] ?? category;
}

/**
 * Actions the filter must NOT offer.
 *
 * - `account_registered` — self-registration is closed (the department creates
 *   every account), so filtering by it can only ever return the older rows.
 * - `user_deleted` — no account deletion exists in the app, so it is always empty.
 * - `login_google` — Google sign-in writes the plain `login` action.
 *
 * The labels stay in AUDIT_ACTIONS so historical rows still render correctly.
 */
const HIDDEN_FILTER_ACTIONS: string[] = [
  "account_registered",
  "user_deleted",
  // `login_google` is declared but never emitted — Google sign-in is logged as
  // a plain `login`. Offering it in the filter only ever produced an empty list.
  "login_google",
];

/** Action options for the filter dropdown, grouped by category. */
export function auditActionOptions(): { value: string; label: string; category: AuditCategory }[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[])
    .filter((value) => !HIDDEN_FILTER_ACTIONS.includes(value))
    .map((value) => ({
      value,
      label: AUDIT_ACTIONS[value],
      category: ACTION_CATEGORY[value],
    }));
}
