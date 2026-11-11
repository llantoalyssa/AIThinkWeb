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

  href?: string;
};

export function departmentNav(userId: string): DepartmentNavItem[] {
  const base = `/dashboard/department/${userId}`;
  return [
    { id: "admin-analytics", icon: <Activity className="h-5 w-5" />, label: "Admin Analytics", href: `${base}/admin-analytics` },
    { id: "executive-summary", icon: <ClipboardList className="h-5 w-5" />, label: "Executive Summary", href: `${base}/executive-summary` },
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `${base}/analytics` },

    { id: "users", icon: <Users className="h-5 w-5" />, label: "Users", href: `${base}?section=users` },
    { id: "journals", icon: <BookOpen className="h-5 w-5" />, label: "Journals", href: `${base}?section=journals` },

    { id: "submissions", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `${base}?section=submissions` },
    { id: "groups", icon: <FolderOpen className="h-5 w-5" />, label: "Advisory Group", href: `${base}?section=groups` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `${base}/approved` },
    { id: "cost-logs", icon: <DollarSign className="h-5 w-5" />, label: "Cost Logs", href: "/cost-logs" },
    { id: "audit-trail", icon: <ScrollText className="h-5 w-5" />, label: "Audit Trail", href: `${base}/audit-trail` },
    { id: "feedback", icon: <Star className="h-5 w-5" />, label: "Feedback", href: `${base}?section=feedback` },
  ];
}
export const DEPARTMENT_SECTIONS = [
  "users",
  "journals",
  "feedback",
  "submissions",
  "groups",
] as const;
export function departmentNotificationsHref(userId: string): string {
  return `/dashboard/department/${userId}/notifications`;
}