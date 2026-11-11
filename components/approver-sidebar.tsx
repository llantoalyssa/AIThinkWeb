"use client";

// ============================================================
// ApproverSidebar — shared sidebar for the approver dashboards
// (associate dean / dean / vcrdes) AND their submission review
// pages, so navigation stays consistent when opening a TAF.
//
// The ITEMS now come from ONE source — components/nav-items.tsx — so the
// dashboard and the review pages can no longer disagree about the role's list.
// The exports below are kept because other modules import them; they are thin
// views over that shared source.
//
// The DEAN alone gets an extra first-position "Executive Summary" item; the
// associate dean and vcrdes get only the core three (Research Analytics, TAF
// Submissions, Approved TAF) plus, for the roles that OWN a group, Advisory
// Group. Callers MUST pass the role-aware list via `items` — the default is
// the core three, so a page that omits it silently drops the dean's Executive
// Summary tab.
// ============================================================

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
  /**
   * Optional route for items that live outside the tab set (the advisory-group
   * tab, which is a real page in the approver dashboards). When present the
   * item navigates instead of switching tabs.
   */
  href?: string;
};

/** A shared NavItem re-typed for the approver pages (tab is always one of the
 *  five approver tabs). */
function asApproverItem(item: NavItem): ApproverNavItem {
  return {
    id: item.id,
    label: item.label,
    icon: item.icon ?? null,
    tab: item.tab as ApproverTab,
    href: item.href,
  };
}

/**
 * The advisory-group nav item — only for the roles that can OWN a group (the
 * associate dean and dean; VCRDES cannot). `href` is given when the item is
 * rendered outside its own dashboard (e.g. the submission review sidebar).
 */
export const ADVISORY_GROUP_NAV_ITEM: ApproverNavItem =
  asApproverItem(ADVISORY_GROUP_ITEM);

// First-position item for the role that can view the Executive Summary (the
// dean — vcrdes does NOT get it, despite what this comment claimed before).
export const EXECUTIVE_SUMMARY_NAV_ITEM: ApproverNavItem =
  asApproverItem(EXECUTIVE_SUMMARY_ITEM);

/** The core three, without Executive Summary. */
export const APPROVER_NAV: ApproverNavItem[] =
  APPROVER_NAV_ITEMS.map(asApproverItem);

export const APPROVER_NAV_WITH_EXECUTIVE_SUMMARY: ApproverNavItem[] = [
  EXECUTIVE_SUMMARY_NAV_ITEM,
  ...APPROVER_NAV,
];

/**
 * Role-aware nav list: the two owning roles get the group item appended.
 * Delegates to the single shared source, so this list can never drift away
 * from the one the dashboards render. (userId "" → tab-only items: this list
 * switches tabs in place, and the routed group item takes its href from
 * opts.groupsHref.)
 */
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

// ============================================================
// Permission-granted page items for an APPROVER surface.
//
// nav-items.tsx (unchanged, on purpose) appends a granted "pages.<id>" item
// built by departmentNav(), so the item's href is the DEPARTMENT route —
// /dashboard/department/<userId>?section=<id>. An approver is not a department
// account and cannot open that route, so at THIS level each granted page id
// that has a route inside the approver's own dashboard is re-pointed at it.
//
// A page id absent from this map keeps the department href it was given; such
// an item is not yet reachable for an approver (the route does not exist), so
// do NOT add a map entry before adding the route.
// ============================================================

/** Granted department page ids that have a route in the approver's dashboard. */
const APPROVER_PAGE_SEGMENTS: Record<string, string> = {
  feedback: "feedback",
  journals: "journals",
  // The GRANT id is `audit` (permission `pages.audit`); the ROUTE segment is
  // `audit-trail`, matching the department's own item and page.
  audit: "audit-trail",
};

/**
 * Granted page ids the shared source CANNOT produce an item for.
 *
 * nav-items.tsx appends a granted item by finding it in departmentNav(), so the
 * grant id has to equal a department item's id. `pages.audit` grants `audit`,
 * while the department's own item is called `audit-trail` — nothing matches, and
 * nav-items.tsx must not be changed. The item is therefore built HERE, with the
 * department's label and an icon at the approver nav's own size, and only when
 * the grant is actually held: an ungranted account gets item-for-item what it
 * gets today.
 */
const APPROVER_PAGE_ITEMS: Record<
  string,
  { label: string; icon: React.ReactNode }
> = {
  audit: { label: "Audit Trail", icon: <ScrollText className="h-4 w-4" /> },
};

/**
 * The role-aware approver nav for a surface that carries REAL routes (the
 * dashboard, a submission review, the Feedback / Journals / Audit Trail pages).
 *
 * `permissions` is the caller's EFFECTIVE permission key list (see
 * getGrantedPermissions in server/actions/permissions.ts). Passing it is what
 * makes a granted department page appear in the approver's nav AND keeps that
 * item visible on every page of the role instead of only the dashboard.
 *
 * With an empty or absent list the output is item-for-item what navItemsFor()
 * returns today — an ungranted approver's nav is therefore UNCHANGED.
 */
export function approverNavItemsFor(
  role: string,
  userId: string,
  permissions?: string[],
): NavItem[] {
  const base = `${rolePath(role as UserRole)}/${userId}`;
  const items = navItemsFor({ role, userId, permissions }).map((item) => {
    // The DEPARTMENT is not a guest here: these items are already its OWN
    // (?section= routes on its own dashboard), so none is re-pointed. Doing so
    // would send its Feedback item to /dashboard/department/<id>/feedback,
    // which does not exist.
    if (role === "department") return item;
    const segment = APPROVER_PAGE_SEGMENTS[item.id];
    // Only a granted page item is re-pointed: an item that carries a tab
    // switches the dashboard tab in place and must keep its tab href.
    if (!segment || item.tab) return item;
    return { ...item, href: `${base}/${segment}` };
  });

  if (role === "department") return items;

  // Granted pages the shared source had no item for (see APPROVER_PAGE_ITEMS).
  // Appended after the role's own items, which is where nav-items.tsx puts the
  // granted ones it can build.
  const granted = permissions ?? [];
  for (const [id, descriptor] of Object.entries(APPROVER_PAGE_ITEMS)) {
    if (!granted.includes(`pages.${id}`)) continue;
    if (items.some((item) => item.id === id)) continue;
    const segment = APPROVER_PAGE_SEGMENTS[id];
    if (!segment) continue;
    // A role that builds its own routed item (the adviser's nav does) would
    // otherwise get a SECOND Audit Trail entry: its own, plus this appended one.
    // Match on the DESTINATION, not just the id, because the ids differ by design
    // (`audit` is the grant id, `audit-trail` the route segment).
    if (items.some((item) => item.href === `${base}/${segment}`)) continue;
    items.push({
      id,
      label: descriptor.label,
      icon: descriptor.icon,
      href: `${base}/${segment}`,
    });
  }

  // Granted pages are appended last; re-sort so they land in the department's
  // sequence (Cost Logs before Audit Trail, Feedback last) instead of at the end
  // in whatever order the grant list happened to arrive.
  return sortNavByDepartmentOrder(items, role);
}

type Props = {
  /**
   * Which item is highlighted. Omit it on a page that is NOT one of the tabs
   * (the route-based Feedback page): no tab item can match `undefined`, so
   * nothing is falsely highlighted — and the granted page item, which carries
   * no tab, is the one item that then highlights itself.
   */
  activeTab?: ApproverTab;
  /**
   * The CURRENT pathname. Routed items (a granted page like /journals or
   * /analytics) carry an `href` and no tab, so `activeTab` alone can never
   * highlight them — and the old fallback ("any item with an href") lit up
   * EVERY routed item at once. Matching the pathname selects exactly one.
   */
  activeHref?: string;
  /** Expanded state (desktop). */
  expanded: boolean;
  /** Optional pending-count badge on TAF Submissions. */
  pendingCount?: number;
  /** Nav items to render (defaults to the core three). Takes the shared
   *  NavItem list `navItemsFor()` returns, or the approver-typed list. */
  items?: NavItem[];
  /** Called when an item is clicked. */
  onSelect: (tab: ApproverTab) => void;
  /**
   * Optional: toggles the collapse state. When provided, the hover handle on the
   * nav's inner edge renders — the same control the department console has.
   */
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
    // relative + group/sidebar: positions the collapse handle on the nav's inner
    // edge and reveals it on hover. overflow-y-auto stays on the aside, which
    // would otherwise clip an absolutely-positioned child.
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
                // A tab item hands its tab back to the caller (the dashboard
                // replaces ?tab=, the review page pushes it); an item that only
                // carries a route navigates instead.
                if (item.tab) {
                  onSelect(item.tab as ApproverTab);
                  return;
                }
                if (item.href) router.push(item.href);
              }}
              // Warm the destination route BEFORE the click, so navigation is
              // instant instead of a cold server round trip. Focus covers
              // keyboard users too.
              onMouseEnter={() => {
                if (item.href) router.prefetch(item.href);
              }}
              onFocus={() => {
                if (item.href) router.prefetch(item.href);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                // BOTH sides must exist: on a routed page `activeTab` is
                // undefined AND every routed item has no `tab`, so a bare
                // `activeTab === item.tab` compared undefined to undefined and
                // highlighted the whole rail at once.
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