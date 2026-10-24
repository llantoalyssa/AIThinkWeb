export const AUDIT_ACTIONS = {

  login: "Signed in",
  login_google: "Signed in with Google",
  logout: "Signed out",
  password_reset: "Reset their password",
  taf_submitted: "Submitted a TAF",
  taf_resubmitted: "Resubmitted a TAF",
  taf_unsubmitted: "Withdrew a TAF submission",
  taf_approved: "Approved a TAF",
  taf_deleted: "Deleted a TAF",
  group_deleted: "Deleted an advisory group",
  user_deleted: "Deleted an account",
  journal_deleted: "Deleted a journal",
  feedback_deleted: "Deleted feedback",
  account_created: "Created an account",
  account_registered: "Registered an account",
  account_updated: "Updated an account",
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
export const ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  login: "auth",
  login_google: "auth",
  logout: "auth",
  password_reset: "auth",
  taf_submitted: "submission",
  taf_resubmitted: "submission",
  taf_unsubmitted: "submission",
  taf_approved: "submission",
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
export function auditActionOptions(): { value: string; label: string; category: AuditCategory }[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((value) => ({
    value,
    label: AUDIT_ACTIONS[value],
    category: ACTION_CATEGORY[value],
  }));
}