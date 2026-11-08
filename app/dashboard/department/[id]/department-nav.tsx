

import {
  Activity,
  Users,
  BookOpen,
  Star,
  ScrollText,
  Inbox,
  FolderOpen,
  BarChart3,
  DollarSign,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";

export type DepartmentNavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** Present → navigate here instead of switching an in-page section. */
  href?: string;
};

export function departmentNav(userId: string): DepartmentNavItem[] {
  const base = `/dashboard/department/${userId}`;
  return [
    // DEPARTMENT-ONLY overview (not a grantable page): role-gated in the page
    // and in its action.
    { id: "admin-analytics", icon: <Activity className="h-5 w-5" />, label: "Admin Analytics", href: `${base}/admin-analytics` },
    // Routed report pages, gated by analytics.view / executive_summary.view /
    // taf.approved.view (nav-items.tsx DEPARTMENT_ITEM_PERMISSIONS + the pages).
    // Executive Summary sits ABOVE Research Analytics (same order for every role).
    { id: "executive-summary", icon: <ClipboardList className="h-5 w-5" />, label: "Executive Summary", href: `${base}/executive-summary` },
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `${base}/analytics` },
    // In-page sections.
    { id: "users", icon: <Users className="h-5 w-5" />, label: "Users", href: `${base}?section=users` },
    { id: "journals", icon: <BookOpen className="h-5 w-5" />, label: "Journals", href: `${base}?section=journals` },
    // The department is the OPTIONAL approver: it may act on ANY pending step.
    { id: "submissions", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `${base}?section=submissions` },
    // The department may OWN advisory groups too (GROUP_OWNER_ROLES in
    // lib/roles.ts). Kept, and placed with the other supervision surfaces.
    { id: "groups", icon: <FolderOpen className="h-5 w-5" />, label: "Advisory Group", href: `${base}?section=groups` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `${base}/approved` },
    // A TOP-LEVEL route (not a ?section=): /cost-logs renders inside this same
    // DepartmentShell, so the chrome does not change.
    { id: "cost-logs", icon: <DollarSign className="h-5 w-5" />, label: "Cost Logs", href: "/cost-logs" },
    { id: "audit-trail", icon: <ScrollText className="h-5 w-5" />, label: "Audit Trail", href: `${base}/audit-trail` },
    { id: "feedback", icon: <Star className="h-5 w-5" />, label: "Feedback", href: `${base}?section=feedback` },
  ];
}

/** Section ids the dashboard can render (used to validate ?section=). */
export const DEPARTMENT_SECTIONS = [
  "users",
  "journals",
  "feedback",
  "submissions",
  "groups",
] as const;

/** Where the bell's "View all" link points for this role. */
export function departmentNotificationsHref(userId: string): string {
  return `/dashboard/department/${userId}/notifications`;
}
