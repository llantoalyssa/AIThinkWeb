import {
  BarChart3,
  BookOpen,
  DollarSign,
  CheckCircle2,
  ClipboardList,
  FilePlus,
  FolderOpen,
  Home,
  Inbox,
  ScrollText,
  Star,
  Users,
} from "lucide-react";

import { departmentNav } from "@/app/dashboard/department/[id]/department-nav";
import { rolePath, type UserRole } from "@/lib/constants";

export type NavItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;

  tab?: string;
  requires?: string;

  active?: boolean;
};
const ICON_SM = "h-4 w-4";
const ICON = "h-5 w-5";
export const GROUP_OWNING_ROLES: string[] = ["associate_dean", "dean"];

export const EXECUTIVE_SUMMARY_ROLES: string[] = ["dean"];
export const EXECUTIVE_SUMMARY_NAV_ITEM: NavItem = {
  id: "executive-summary",
  label: "Executive Summary",
  icon: <ClipboardList className={ICON_SM} />,
  tab: "executive-summary",
  requires: "executive_summary.view",
};
export const APPROVER_NAV_ITEMS: NavItem[] = [
  {
    id: "analytics",
    label: "Research Analytics",
    icon: <BarChart3 className={ICON_SM} />,
    tab: "analytics",
    requires: "analytics.view",
  },
  {
    id: "pending",
    label: "TAF Submissions",
    icon: <Inbox className={ICON_SM} />,
    tab: "pending",
    requires: "approval.participate",
  },
  {
    id: "approved",
    label: "Approved TAF",
    icon: <CheckCircle2 className={ICON_SM} />,
    tab: "approved",
    requires: "taf.approved.view",
  },
];
export const ADVISORY_GROUP_NAV_ITEM: NavItem = {
  id: "groups",
  label: "Advisory Group",
  icon: <FolderOpen className={ICON_SM} />,
  tab: "groups",
  requires: "groups.view",
};
function approverItems(role: string, userId: string): NavItem[] {
  const tabHref = (tab: string): string | undefined =>
    userId ? `${rolePath(role as UserRole)}/${userId}?tab=${tab}` : undefined;

  const items: NavItem[] = [];
  if (EXECUTIVE_SUMMARY_ROLES.includes(role)) {
    items.push({
      ...EXECUTIVE_SUMMARY_NAV_ITEM,
      href: tabHref(EXECUTIVE_SUMMARY_NAV_ITEM.tab as string),
    });
  }
  for (const item of APPROVER_NAV_ITEMS) {
    items.push({ ...item, href: tabHref(item.tab as string) });
  }
  if (GROUP_OWNING_ROLES.includes(role)) {
    items.push({
      ...ADVISORY_GROUP_NAV_ITEM,
      href: tabHref(ADVISORY_GROUP_NAV_ITEM.tab as string),
    });
  }
  return items;
}
function adviserItems(userId: string, permissions?: string[]): NavItem[] {
  const base = `${rolePath("adviser")}/${userId}`;
  const granted = permissions ? new Set(permissions) : null;

  const items: NavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <BarChart3 className={ICON} />,
      href: base,
    },
  ];
  if (!granted || granted.has("approval.participate")) {
    items.push({
      id: "pending",
      label: "Pending TAFs",
      icon: <Inbox className={ICON} />,
      href: `${base}/pending`,
      requires: "approval.participate",
    });
  }

  if (granted?.has("analytics.view")) {
    items.push({
      id: "analytics",
      label: "Research Analytics",
      icon: <BarChart3 className={ICON} />,
      href: `${base}/analytics`,
      requires: "analytics.view",
    });
  }
  if (granted?.has("taf.approved.view")) {
    items.push({
      id: "approved",
      label: "Approved TAF",
      icon: <CheckCircle2 className={ICON} />,
      href: `${base}/approved`,
      requires: "taf.approved.view",
    });
  }
  if (granted?.has("executive_summary.view")) {
    items.push({
      id: "executive-summary",
      label: "Executive Summary",
      icon: <ClipboardList className={ICON} />,
      href: `${base}/executive-summary`,
      requires: "executive_summary.view",
    });
  }
  if (granted?.has("pages.journals")) {
    items.push({
      id: "journals",
      label: "Journals",
      icon: <BookOpen className={ICON} />,
      href: `${base}/journals`,
      requires: "pages.journals",
    });
  }
  if (granted?.has("pages.audit")) {
    items.push({
      id: "audit",
      label: "Audit Trail",
      icon: <ScrollText className={ICON} />,
      href: `${base}/audit-trail`,
      requires: "pages.audit",
    });
  }
  return items;
}
function studentItems(userId: string): NavItem[] {
  const base = `${rolePath("student")}/${userId}`;
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <Home className={ICON} />,
      href: base,
    },
    {
      id: "taf",
      label: "Topic Abstract Form",
      icon: <FilePlus className={ICON} />,
      href: `${base}/taf`,
    },
    {
      id: "advisory-group",
      label: "Advisory Group",
      icon: <Users className={ICON} />,
      href: `${base}/group`,
    },
    {
      id: "feedback",
      label: "Feedback",
      icon: <Star className={ICON} />,
      href: `${base}/feedback`,
    },

  ];
}
function departmentItems(userId: string): NavItem[] {
  return departmentNav(userId).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.href,
  }));
}
const DEPARTMENT_ITEM_PERMISSIONS: Record<string, string> = {
  groups: "groups.view",
  submissions: "approval.participate",
  users: "pages.users",
  journals: "pages.journals",
  feedback: "pages.feedback",
  "audit-trail": "pages.audit",
  "cost-logs": "pages.cost_logs",
  analytics: "analytics.view",
  approved: "taf.approved.view",
  "executive-summary": "executive_summary.view",
};
const TOP_LEVEL_PAGE_ITEMS: Record<string, NavItem> = {
  "pages.cost_logs": {
    id: "cost-logs",
    label: "Cost Logs",
    icon: <DollarSign className={ICON} />,
    href: "/cost-logs",
    requires: "pages.cost_logs",
  },
};

export function departmentItemPermission(itemId: string): string | undefined {
  return DEPARTMENT_ITEM_PERMISSIONS[itemId];
}
const NAV_SLOTS: Record<string, number> = {
  dashboard: 0,
  "admin-analytics": 1,
  "executive-summary": 2,
  analytics: 3,
  users: 4,
  journals: 5,
  submissions: 6,
  pending: 6,
  groups: 7,
  "advisory-group": 7,
  approved: 8,
  "cost-logs": 9,
  audit: 10,
  "audit-trail": 10,
  feedback: 11,
};
export function sortNavByDepartmentOrder(items: NavItem[], role: string): NavItem[] {
  const slotOf = (id: string) =>
    role === "adviser" && id === "pending" ? 1 : (NAV_SLOTS[id] ?? 99);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const sa = slotOf(a.item.id);
      const sb = slotOf(b.item.id);
      if (sa !== sb) return sa - sb;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function navItemsFor({
  role,
  userId,
  permissions,
}: {
  role: string;
  userId: string;
  permissions?: string[];
}): NavItem[] {
  let items: NavItem[];
  if (role === "associate_dean" || role === "dean" || role === "vcrdes") {
    items = approverItems(role, userId);
  } else if (role === "adviser") {
    items = adviserItems(userId, permissions);
  } else if (role === "student") {
    items = studentItems(userId);
  } else if (role === "department") {
    items = departmentItems(userId);

    if (permissions !== undefined) {
      const granted = new Set(permissions);
      items = items.filter((item) => {
        const required = DEPARTMENT_ITEM_PERMISSIONS[item.id];
        return required === undefined || granted.has(required);
      });
    }
  } else {
    items = [];
  }
  if (permissions !== undefined) {
    const held = new Set(permissions);
    items = items.filter(
      (item) => !item.requires || held.has(item.requires),
    );
  }
  if (role !== "department" && permissions !== undefined) {
    for (const [permissionKey, pageItem] of Object.entries(TOP_LEVEL_PAGE_ITEMS)) {
      if (
        permissions.includes(permissionKey) &&
        !items.some((existing) => existing.id === pageItem.id)
      ) {
        items.push(pageItem);
      }
    }
  }

  const grants = (permissions ?? [])
    .filter((permission) => permission.startsWith("pages."))
    .map((permission) => permission.slice("pages.".length));

  if (role !== "department" && grants.length > 0) {
    for (const item of departmentItems(userId)) {
      if (grants.includes(item.id) && !items.some((existing) => existing.id === item.id)) {
        items.push(item);
      }
    }
  }
  return role === "department" || role === "student"
    ? items
    : sortNavByDepartmentOrder(items, role);
}