"use client";
import { useRouter } from "next/navigation";
import { ScrollText } from "lucide-react";

import { rolePath, type UserRole } from "@/lib/constants";
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";

import {
  ADVISORY_GROUP_NAV_ITEM as ADVISORY_GROUP_ITEM,
  APPROVER_NAV_ITEMS,
  EXECUTIVE_SUMMARY_NAV_ITEM as EXECUTIVE_SUMMARY_ITEM,
  navItemsFor,
  sortNavByDepartmentOrder,
  type NavItem,
} from "@/components/nav-items";

export type ApproverTab =
  | "analytics"
  | "pending"
  | "approved"
  | "executive-summary"
  | "groups";

export type ApproverNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  tab: ApproverTab;
  href?: string;
};
function asApproverItem(item: NavItem): ApproverNavItem {
  return {
    id: item.id,
    label: item.label,
    icon: item.icon ?? null,
    tab: item.tab as ApproverTab,
    href: item.href,
  };
}
export const ADVISORY_GROUP_NAV_ITEM: ApproverNavItem =
  asApproverItem(ADVISORY_GROUP_ITEM);
export const EXECUTIVE_SUMMARY_NAV_ITEM: ApproverNavItem =
  asApproverItem(EXECUTIVE_SUMMARY_ITEM);
export const APPROVER_NAV: ApproverNavItem[] =
  APPROVER_NAV_ITEMS.map(asApproverItem);

export const APPROVER_NAV_WITH_EXECUTIVE_SUMMARY: ApproverNavItem[] = [
  EXECUTIVE_SUMMARY_NAV_ITEM,
  ...APPROVER_NAV,
];
export function approverNavFor(
  role: string,
  opts?: { withExecutiveSummary?: boolean; groupsHref?: string },
): ApproverNavItem[] {
  const shared = navItemsFor({ role, userId: "" });
  const items: ApproverNavItem[] = [];

  if (
    opts?.withExecutiveSummary &&
    !shared.some((item) => item.id === "executive-summary")
  ) {
    items.push(asApproverItem(EXECUTIVE_SUMMARY_ITEM));
  }

  for (const item of shared) {
    if (item.id === "executive-summary" && !opts?.withExecutiveSummary) continue;
    items.push(
      item.id === "groups" && opts?.groupsHref
        ? { ...asApproverItem(item), href: opts.groupsHref }
        : asApproverItem(item),
    );
  }

  return items;
}
const APPROVER_PAGE_SEGMENTS: Record<string, string> = {
  feedback: "feedback",
  journals: "journals",
  audit: "audit-trail",
};
const APPROVER_PAGE_ITEMS: Record<
  string,
  { label: string; icon: React.ReactNode }
> = {
  audit: { label: "Audit Trail", icon: <ScrollText className="h-4 w-4" /> },
};
export function approverNavItemsFor(
  role: string,
  userId: string,
  permissions?: string[],
): NavItem[] {
  const base = `${rolePath(role as UserRole)}/${userId}`;
  const items = navItemsFor({ role, userId, permissions }).map((item) => {
    if (role === "department") return item;
    const segment = APPROVER_PAGE_SEGMENTS[item.id];
    if (!segment || item.tab) return item;
    return { ...item, href: `${base}/${segment}` };
  });

  if (role === "department") return items;
  const granted = permissions ?? [];
  for (const [id, descriptor] of Object.entries(APPROVER_PAGE_ITEMS)) {
    if (!granted.includes(`pages.${id}`)) continue;
    if (items.some((item) => item.id === id)) continue;
    const segment = APPROVER_PAGE_SEGMENTS[id];
    if (!segment) continue;
    if (items.some((item) => item.href === `${base}/${segment}`)) continue;
    items.push({
      id,
      label: descriptor.label,
      icon: descriptor.icon,
      href: `${base}/${segment}`,
    });
  }
  return sortNavByDepartmentOrder(items, role);
}

type Props = {
  activeTab?: ApproverTab;
  activeHref?: string;

  expanded: boolean;

  pendingCount?: number;
  items?: NavItem[];

  onSelect: (tab: ApproverTab) => void;
  onToggle?: () => void;
};

export default function ApproverSidebar({
  activeTab,
  activeHref,
  expanded,
  pendingCount = 0,
  items = APPROVER_NAV,
  onSelect,
  onToggle,
}: Props) {
  const router = useRouter();
  return (
    <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
    <aside
      className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      <nav className="flex flex-col gap-1 p-2 pt-4">
        {items.map((item) => {
          const badge =
            item.id === "pending" && pendingCount > 0 ? pendingCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.tab) {
                  onSelect(item.tab as ApproverTab);
                  return;
                }
                if (item.href) router.push(item.href);
              }}
              onMouseEnter={() => {
                if (item.href) router.prefetch(item.href);
              }}
              onFocus={() => {
                if (item.href) router.prefetch(item.href);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                (!!activeTab && !!item.tab && activeTab === item.tab) ||
                (!!activeHref && !!item.href && item.href === activeHref)
                  ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              } ${expanded ? "" : "justify-center"} cursor-pointer`}
              title={item.label}
            >
              {item.icon}
              {expanded && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}
              {expanded && badge > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
      {onToggle && (
        <SidebarCollapseHandle expanded={expanded} onToggle={onToggle} />
      )}
    </div>
  );
}