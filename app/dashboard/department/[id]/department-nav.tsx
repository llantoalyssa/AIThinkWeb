import { Users, BookOpen, Star, Bell, ScrollText } from "lucide-react";

export type DepartmentNavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;

  href?: string;
};

export function departmentNav(userId: string): DepartmentNavItem[] {
  const base = `/dashboard/department/${userId}`;
  return [
    { id: "users", icon: <Users className="h-5 w-5" />, label: "Users", href: `${base}?section=users` },
    { id: "journals", icon: <BookOpen className="h-5 w-5" />, label: "Journals", href: `${base}?section=journals` },
    { id: "feedback", icon: <Star className="h-5 w-5" />, label: "Feedback", href: `${base}?section=feedback` },
    {
      id: "notifications",
      icon: <Bell className="h-5 w-5" />,
      label: "Notifications",
      href: `${base}/notifications`,
    },
    {
      id: "audit-trail",
      icon: <ScrollText className="h-5 w-5" />,
      label: "Audit Trail",
      href: `${base}/audit-trail`,
    },
  ];
}
export const DEPARTMENT_SECTIONS = ["users", "journals", "feedback"] as const;
export function departmentNotificationsHref(userId: string): string {
  return `/dashboard/department/${userId}/notifications`;
}