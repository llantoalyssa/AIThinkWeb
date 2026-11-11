// ============================================================
// nav-items — THE single source for every role's side navigation.
//
// WHY THIS EXISTS: navigation used to be rebuilt per page (22 files built
// their own item arrays and 17 rendered their own <aside>), so an item added
// on one page silently never appeared on another — the dean's "Executive
// Summary" and every role's "Advisory Group" both went missing that way.
// The items are defined HERE once; every surface renders navItemsFor() output.
//
// Boundaries (deliberate, so this stays a pure source):
//  - Badge counts are NOT part of an item. Callers keep their own count wiring
//    keyed on item.id ("pending", "notifications").
//  - `active` is left to the CALLER: which item is highlighted depends on the
//    route the caller is on, not on the role.
//  - This is a .tsx (not .ts) because items carry icon ELEMENTS — the same
//    shape the approver nav has always used.
//
// SIDEBAR WIDTH — ONE value for every side nav in the app (dashboard, profile,
// group detail, submission review, notifications, department shell, approver
// sidebar, mobile drawer):
//
//     expanded w-64 · collapsed w-16 · mobile drawer w-64
//
// Every one of those surfaces renders its own <aside> (they cannot share markup
// without a layout refactor), so the width is the one thing that must not be
// re-typed from memory: a stray w-48/w-56 shrinks the rail and turns
// "Research Analytics" into "Research Analy…". Before changing a nav, grep:
//
//     grep -rn "<aside" -A 3 app components --include=*.tsx | grep -o 'w-[0-9]*'
//
// Any value other than w-64 / w-16 is a bug.
// ============================================================

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
  /**
   * Real route for the item. Approver tab items carry `?tab=<tab>`; the
   * department section items carry `?section=<id>`.
   */
  href?: string;
  /** Dashboard tab the item switches to (approver roles only). */
  tab?: string;
  /**
   * The PERMISSION key this item requires (migration 053/060). Filtered inside
   * navItemsFor() the moment a permission list is supplied, so removing a key
   * removes the item on every surface of that role at once — the nav is the
   * only place a "page permission" becomes visible.
   */
  requires?: string;
  /** Set by the CALLER that knows which item its own route is on. */
  active?: boolean;
};

/** Icon size the approver surfaces render (ApproverSidebar has always used
 *  16px; every other role renders 20px). One source, one size per role. */
const ICON_SM = "h-4 w-4";
const ICON = "h-5 w-5";

/** Roles that own advisory groups (VCRDES cannot). */
export const GROUP_OWNING_ROLES: string[] = ["associate_dean", "dean"];
/** Roles allowed to see the Executive Summary. */
export const EXECUTIVE_SUMMARY_ROLES: string[] = ["dean"];

/** Executive Summary — first position, and only for the roles that may see it. */
export const EXECUTIVE_SUMMARY_NAV_ITEM: NavItem = {
  id: "executive-summary",
  label: "Executive Summary",
  icon: <ClipboardList className={ICON_SM} />,
  tab: "executive-summary",
  requires: "executive_summary.view",
};

/** The core three items every approver role gets (associate dean / dean / vcrdes). */
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

/**
 * Advisory Group — only for the roles that can OWN a group (associate dean,
 * dean). `href` is filled in by navItemsFor() when a userId is known (it is a
 * real page, not an in-page tab).
 */
export const ADVISORY_GROUP_NAV_ITEM: NavItem = {
  id: "groups",
  label: "Advisory Group",
  icon: <FolderOpen className={ICON_SM} />,
  tab: "groups",
  requires: "groups.view",
};

/**
 * The three approver roles, in the order they render today: Executive Summary
 * (dean only) → Research Analytics → TAF Submissions → Approved TAF →
 * Advisory Group (associate dean + dean only).
 */
function approverItems(role: string, userId: string): NavItem[] {
  // A tab URL only exists once we know WHOSE dashboard it is. Without a userId
  // the items stay tab-only — that is the sidebar's default list, and the
  // sidebar switches tabs in place for those callers anyway.
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

/**
 * adviser: Dashboard + Notifications, PLUS every capability the department
 * console has granted this account.
 *
 * The adviser's two default items are the whole of its nav today — the advisory
 * groups live ON the dashboard, not behind an item — so a grant used to change
 * nothing here at all. Each granted key now adds its own ROUTED page (the route
 * segment is the adviser's own: /analytics, /approved, /journals, /audit-trail),
 * which is the only thing that makes "give the adviser Research Analytics" mean
 * something. With `permissions` undefined (not resolved yet) the list is
 * exactly the two default items, so an un-granted adviser is unchanged.
 */
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

  // The queue itself, not just a number: the dashboard's "Pending TAFs" card
  // used to be a dead end that forced a group-by-group hunt. Gated by the same
  // key that puts an account in the approval queue at all.
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

  // Notifications has NO side-nav item any more (any role): the header bell is
  // the entry point and its "View all" opens the notifications route, which
  // still exists. Keeping an item here duplicated that affordance.
  return items;
}

/** student: Dashboard / Topic Abstract Form / Advisory Group / Feedback /
 *  Notifications. */
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
    // No Notifications item — the bell's "View all" covers it for every role.
  ];
}

/**
 * department: Users / Journals / Feedback (in-page sections, ?section=) plus
 * the two routed pages (Notifications, Audit Trail).
 *
 * departmentNav() is already the department role's own single source — the
 * shell, the dashboard and the notifications page all read it — so this
 * REUSES it rather than copying the five items a second time.
 */
function departmentItems(userId: string): NavItem[] {
  return departmentNav(userId).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.href,
  }));
}

/**
 * The permission each DEPARTMENT nav item needs to stay visible.
 *
 * The department is NOT exempt from the permission set: its role defaults happen
 * to include every key below (migration 053), so a normal department account
 * looks exactly as it always has — but a DENY on one of them removes exactly
 * that item, the same way it removes any other role's granted page.
 *
 * An item with NO entry here (`notifications`) is always present: it is the
 * account's own inbox, not a capability.
 */
const DEPARTMENT_ITEM_PERMISSIONS: Record<string, string> = {
  groups: "groups.view",
  submissions: "approval.participate",
  users: "pages.users",
  journals: "pages.journals",
  feedback: "pages.feedback",
  "audit-trail": "pages.audit",
  "cost-logs": "pages.cost_logs",
  // The three REPORT pages, routed like the approver roles' tabs. Until these
  // existed the department held `analytics.view`, `taf.approved.view` and
  // `executive_summary.view` by default with nowhere to spend them.
  analytics: "analytics.view",
  approved: "taf.approved.view",
  "executive-summary": "executive_summary.view",
};

/**
 * The permission a department nav item requires, or `undefined` for the items
 * that are always present. Exported so the department console's own SECTION
 * gate (app/dashboard/department/[id]/page.tsx) reads the SAME mapping as the
 * nav: an item the nav hides can never stay open as a section, and vice versa.
 */
/**
 * Granted pages that live OUTSIDE /dashboard and therefore cannot be built from
 * departmentNav(): the same href works for every role, so one map serves all of
 * them. The Department's own copy comes from departmentNav() and is filtered by
 * DEPARTMENT_ITEM_PERMISSIONS above.
 */
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

/**
 * Every side-nav item for `role`, in the order that role renders it.
 *
 * `permissions` is the caller's EFFECTIVE permission key list (see
 * getGrantedPermissions in server/actions/permissions.ts) and does THREE things:
 *  - for the DEPARTMENT role it FILTERS the list (see the map above);
 *  - for EVERY role it removes an item whose `requires` key the account does not
 *    hold (approver tabs, Executive Summary, Advisory Group);
 *  - for a non-department role it APPENDS the pages that role can open — the
 *    adviser builds its own routed items in adviserItems(), the approver roles get
 *    a granted department page re-pointed at their own route by
 *    approverNavItemsFor().
 *
 * BACKWARD COMPATIBILITY: with `permissions` UNDEFINED the department list is
 * returned WHOLE — unchanged from today. An empty nav for a caller that simply
 * has not loaded the grants yet would be worse than a permissive one, and the
 * server-side guards are what actually refuse the data.
 */
/**
 * Canonical side-nav order — the DEPARTMENT console's sequence, shared by every
 * role so a granted page sits in the same place wherever it appears.
 *
 * Slot numbers, not a flat list: roles have different ids for the same concept
 * (`pending` is "Pending TAFs" for an adviser and "TAF Submissions" for an
 * approver; `audit` is the grant id, `audit-trail` the route segment).
 * Anything unlisted sorts after the known items, keeping its build order.
 */
const NAV_SLOTS: Record<string, number> = {
  dashboard: 0,
  "admin-analytics": 1,
  // Executive Summary precedes Research Analytics everywhere (the office's
  // sequence): 2 = executive-summary, 3 = analytics.
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

/**
 * Sort a role's nav into the department's sequence. Stable: items that share a
 * slot, and items with no slot, keep their relative build order.
 *
 * An ADVISER's "Pending TAFs" is a role default that has always sat directly
 * under Dashboard, so it keeps that position instead of moving down to the TAF
 * Submissions slot.
 */
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
    // Only filter when a set was actually supplied (see the note above).
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

  // ── Capability items ───────────────────────────────────────────────────
  // A capability item (approver tab, executive summary, advisory group) names
  // the key it needs. Applied only once a permission list has actually been
  // resolved — `undefined` means "still loading", and hiding the whole nav for a
  // beat would be worse than one permissive paint.
  if (permissions !== undefined) {
    const held = new Set(permissions);
    items = items.filter(
      (item) => !item.requires || held.has(item.requires),
    );
  }

  // Top-level granted pages (cost logs). Department is excluded: its item is
  // part of departmentNav() and already filtered by the key.
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

  // The department's own list is already in that sequence, and the STUDENT list
  // is a fixed four-item order of its own — sorting it by the department slots
  // pushed "Topic Abstract Form" (which has no slot) to the very bottom.
  return role === "department" || role === "student"
    ? items
    : sortNavByDepartmentOrder(items, role);
}
