"use client";

// ============================================================
// ApproverDashboard — shared dashboard for Associate Dean,
// Dean, and VCRDES accounts.
// Side nav: Research Analytics (placeholder), TAF Submissions
// (pending approvals table), Approved TAFs (table with search
// + academic-year filter). All rows link to the submission
// detail page where the approver reviews and decides.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CurrentUser } from "@/server/actions/auth";
import { getApproverShell } from "@/server/actions/approver-shell";
import { createClient } from "@/server/supabase/client";
import {
  getPendingApprovals,
  type ApprovalListItem,
  type ApprovalNotification,
} from "@/server/actions/approval-workflow";
import { rolePath, HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";
import ApproverSidebar, {
  approverNavItemsFor,
  type ApproverTab,
} from "@/components/approver-sidebar";
import ResearchAnalytics from "@/components/research-analytics";
import SupervisorAdvisoryGroups from "@/components/supervisor-advisory-groups";
import ExecutiveSummary from "@/components/executive-summary";
import { type AnalyticsData } from "@/server/actions/research-analytics";
import { type ExecutiveSummaryData } from "@/server/actions/executive-summary";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import {
  Loader2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Search,
  CalendarDays,
  Download,
} from "lucide-react";
import { toast } from "sonner";

type Role = "associate_dean" | "dean" | "vcrdes";

const ROLE_TITLE: Record<Role, string> = {
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
};

const ROLE_LABEL: Record<Role, string> = {
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
};

// Tab set comes from the shared sidebar module so adding a nav item there can
// never leave this page's tab union out of sync (it silently did for "groups").
type Tab = ApproverTab;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  revisions_needed: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  revisions_needed: "Revisions Needed",
  approved: "Approved",
};

export default function ApproverDashboard({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The permission keys this account effectively holds, supplied with the shell
   * (getApproverShell) so no second request is needed. EMPTY until it arrives —
   * and an empty list is exactly today's behaviour, so an account with no
   * grants (every account, until the department console grants one) renders the
   * same items it always has.
   */
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);
  // The URL is the SINGLE SOURCE OF TRUTH for the active tab.
  //
  // Mirroring the URL into React state caused a race: when the approver
  // arrived here via a client-side navigation (e.g. right after approving a
  // TAF) the state could initialise from a stale URL and default to
  // "analytics" — leaving the address bar on ?tab=pending while the UI
  // rendered Research Analytics. Deriving the tab from `searchParams` every
  // render makes it impossible for the rendered tab to disagree with the URL.
  //
  // (Research Analytics is the landing tab; Executive Summary is the DEAN's.)
  const requestedTab = searchParams.get("tab");
  // NOTE: "analytics" MUST be in this list. It used to be omitted because the
  // non-dean default is already "analytics", which masked the bug for the
  // associate dean / vcrdes — but the DEAN's default is "executive-summary",
  // so clicking Research Analytics (?tab=analytics) fell through to the
  // default and the page stayed on Executive Summary: the nav item looked
  // dead.
  const tab: Tab =
    requestedTab === "analytics" ||
    requestedTab === "pending" ||
    requestedTab === "approved" ||
    requestedTab === "executive-summary" ||
    (requestedTab === "groups" && (role === "associate_dean" || role === "dean"))
      ? (requestedTab as Tab)
      : role === "dean"
        ? "executive-summary"
        : "analytics";

  // Changing the tab = changing the URL (keeps the query reload-safe).
  const setTab = useCallback(
    (next: Tab) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", next);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Only the DEAN gets the first-position "Executive Summary" tab. VCRDES and
  // the associate dean keep the core three tabs. The two roles that can OWN a
  // group (associate dean, dean) additionally get "Advisory Group" — the same
  // place the adviser's group UI lives.
  //
  // WHICH items those are is decided by the ONE shared source
  // (components/nav-items.tsx), so this page, the submission review page and
  // the adviser's group page can no longer show different navs for one role.
  // `isExecutiveRole` is still what the tab guard and the panel below key off.
  //
  // `permissions` is what surfaces a GRANTED department page (e.g. the one
  // associate dean with "pages.feedback"): nav-items appends a "pages.*" item
  // for it, and approverNavItemsFor re-points that item at this ROLE's own
  // route, because the department route it would otherwise carry is not
  // reachable for an approver. With no grants the list is unchanged.
  const isExecutiveRole = role === "dean";
  const navItems = approverNavItemsFor(
    role,
    currentUser?.id ?? "",
    permissions,
  );
  // Guard against a stale ?tab= for a role that does not have it.
  const roleTab: Tab =
    tab === "executive-summary" && !isExecutiveRole
      ? "analytics"
      : tab === "groups" && role !== "associate_dean" && role !== "dean"
        ? "analytics"
        : tab;

  /**
   * WHICH tabs this account may open is decided by PERMISSION, not by role
   * (migrations 053/060). Until the list arrives (`undefined`) every tab is
   * allowed, so the first paint is the role's normal dashboard rather than an
   * empty one; once it lands, a key the account does not hold removes its tab
   * from the rail AND from here — so a hand-typed `?tab=analytics` cannot render
   * a panel the account may not use.
   */
  const TAB_PERMISSIONS: Record<Tab, string> = {
    "executive-summary": "executive_summary.view",
    analytics: "analytics.view",
    pending: "approval.participate",
    approved: "taf.approved.view",
    groups: "groups.view",
  };
  const roleTabs: Tab[] = [
    ...(isExecutiveRole ? (["executive-summary"] as Tab[]) : []),
    "analytics",
    "pending",
    "approved",
    ...(role === "associate_dean" || role === "dean"
      ? (["groups"] as Tab[])
      : []),
  ];
  const allowedTabs =
    permissions === undefined
      ? roleTabs
      : roleTabs.filter((t) => permissions.includes(TAB_PERMISSIONS[t]));
  const effectiveTab: Tab = allowedTabs.includes(roleTab)
    ? roleTab
    : (allowedTabs[0] ?? "analytics");
  /** null = this account holds none of its role's tab permissions. */
  const view: Tab | null = allowedTabs.length > 0 ? effectiveTab : null;

  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [pending, setPending] = useState<ApprovalListItem[]>([]);
  const [approved, setApproved] = useState<ApprovalListItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  // The approved list is loaded once by getApproverShell and refreshed only by
  // a full navigation, so it has no loading state of its own any more.
  const loadingApproved = false;

  // Server-supplied first payloads (from getApproverShell) so the bell and the
  // landing-tab panel do NOT fetch on mount; each keeps its own fetch as a
  // fallback for when its prop is absent or null.
  const [initialNotifications, setInitialNotifications] = useState<
    ApprovalNotification[] | undefined
  >(undefined);
  /** submissionId → owned group slug, arriving WITH the notifications above so
   *  the bell routes an owned-group submission like the notifications page. */
  const [initialOwnedGroupSlugs, setInitialOwnedGroupSlugs] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [initialAnalytics, setInitialAnalytics] = useState<
    AnalyticsData | null | undefined
  >(undefined);
  const [initialExecutiveSummary, setInitialExecutiveSummary] = useState<
    ExecutiveSummaryData | null | undefined
  >(undefined);

  // Approved table filters
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [exportingApproved, setExportingApproved] = useState(false);

  // ── Auth guard + first data load ─────────────────────────
  // ONE bundled server action (getApproverShell) replaces five separate
  // queued calls: getCurrentUser, getPendingApprovals, getApprovedTAFs, the
  // landing tab's analytics/summary, and the bell's notifications.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const shell = await getApproverShell(role);
      if (cancelled) return;
      if (!shell.success) {
        router.replace("/login");
        return;
      }
      const user = shell.user;
      if (user.role !== role) {
        router.replace(`${rolePath(user.role)}/${user.id}`);
        return;
      }
      if (user.id !== window.location.pathname.split("/")[3]) {
        router.replace(`${rolePath(role)}/${user.id}`);
        return;
      }
      setCurrentUser(user);
      setPending(shell.pending);
      setApproved(shell.approved);
      setInitialNotifications(shell.notifications);
      setInitialOwnedGroupSlugs(shell.ownedGroupSlugs);
      setInitialAnalytics(shell.analytics);
      setInitialExecutiveSummary(shell.executiveSummary);
      setPermissions(shell.permissions);
      setLoading(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router, role]);

  // ── Load data ────────────────────────────────────────────
  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    const result = await getPendingApprovals();
    if (result.success) setPending(result.data);
    setLoadingPending(false);
  }, []);

  // NOTE: the initial pending/approved load is GONE on purpose — it used to
  // fire two more queued server actions on mount right after the auth guard.
  // Both lists now arrive with getApproverShell() in the same single request.
  // loadPending is still used by the realtime subscription below.

  // ── Realtime: refetch pending approvals when a TAF is routed to me ──
  // A submission becomes "up for my approval" via INSERT (adviser submits
  // and routes to me) or UPDATE (previous approver approves → current
  // role becomes mine). Listen for both and refetch so the pending list
  // and the bell badge update instantly. RLS passes for rows routed to me.
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
      const channel = supabase
        .channel(`approver-pending-live-${role}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "group_taf_submissions",
            filter: `current_approver_role=eq.${role}`,
          },
          () => { void loadPending(); },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_taf_submissions",
            filter: `current_approver_role=eq.${role}`,
          },
          () => { void loadPending(); },
        )
        .subscribe();
      sub = channel;
    } catch {
      // realtime unavailable — polling fallback in the initial load covers it.
    }
    return () => {
      sub?.unsubscribe();
    };
  }, [role, loadPending]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Approved table filters ───────────────────────────────
  const years = Array.from(
    new Set(approved.map((a) => a.academicYear)),
  ).sort((a, b) => b.localeCompare(a));

  const filteredApproved = approved.filter((a) => {
    const matchesSearch =
      !search ||
      a.proposedTitle.toLowerCase().includes(search.toLowerCase()) ||
      a.studentName.toLowerCase().includes(search.toLowerCase()) ||
      a.groupName.toLowerCase().includes(search.toLowerCase());
    const matchesYear = yearFilter === "all" || a.academicYear === yearFilter;
    return matchesSearch && matchesYear;
  });

  // ── Export the filtered Approved TAF table to PDF ─────────────────
  function esc(s: string | null | undefined): string {
    return (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportApprovedPdf() {
    if (exportingApproved) return;
    if (filteredApproved.length === 0) {
      toast.error("No approved TAFs to export.");
      return;
    }
    const rows = filteredApproved
      .map((a) => {
        const st = STATUS_STYLES[a.status] || "";
        const statusChip = STATUS_LABELS[a.status]
          ? `<span style="background:${
              st.includes("amber") ? "#fef3c7" : st.includes("blue") ? "#dbeafe" : st.includes("red") ? "#fee2e2" : "#dcfce7"
            };color:${
              st.includes("amber") ? "#b45309" : st.includes("blue") ? "#1d4ed8" : st.includes("red") ? "#b91c1c" : "#15803d"
            };padding:2px 8px;border-radius:999px;font-size:11px;">${STATUS_LABELS[a.status] || esc(a.status)}</span>`
          : esc(a.status);
        const simColor = a.combinedScore >= HIGH_SIMILARITY_THRESHOLD ? "#b91c1c" : "#15803d";
        return `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px 10px;">${esc(a.groupName)}</td>
            <td style="padding:8px 10px;">${esc(a.proposedTitle)}<br/><span style="color:#6b7280;font-size:11px;">${esc(a.studentName)}${
              a.studentSrCode ? ` · ${esc(a.studentSrCode)}` : ""
            }</span></td>
            <td style="padding:8px 10px;text-align:center;color:${simColor};font-weight:600;">${a.combinedScore}%</td>
            <td style="padding:8px 10px;">${new Date(a.submittedAt).toLocaleDateString()}</td>
            <td style="padding:8px 10px;">${statusChip}</td>
          </tr>`;
      })
      .join("");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;padding:16px;color:#111827;">
      <h2 style="margin:0 0 4px;font-size:18px;">Approved TAFs</h2>
      <p style="margin:0 0 14px;color:#6b7280;font-size:12px;">${filteredApproved.length} fully approved TAF(s)${
        yearFilter !== "all" ? ` · Academic Year ${esc(yearFilter)}` : ""
      }</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:2px solid #111827;text-align:left;">
            <th style="padding:8px 10px;">Advisory Group</th>
            <th style="padding:8px 10px;">Proposed Title</th>
            <th style="padding:8px 10px;text-align:center;">Similarity</th>
            <th style="padding:8px 10px;">Date</th>
            <th style="padding:8px 10px;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    document.getElementById("approved-export-root")?.remove();
    const clone = document.createElement("div");
    clone.id = "approved-export-root";
    clone.innerHTML = html;
    clone.style.display = "none";
    document.body.appendChild(clone);

    const style = document.createElement("style");
    style.id = "approved-print-style";
    style.textContent = `
      @media print {
        body > *:not(#approved-export-root) { display: none !important; }
        #approved-export-root { display: block !important; }
        #approved-export-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }`;
    document.head.appendChild(style);
    setExportingApproved(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.getElementById("approved-export-root")?.remove();
        document.getElementById("approved-print-style")?.remove();
        setExportingApproved(false);
      }, 400);
    }, 50);
  }

  /** Canonical URL for a submission review row (used for both navigation and
   *  prefetching). */
  function submissionHref(id: string): string | null {
    if (!currentUser) return null;
    return `${rolePath(role)}/${currentUser.id}/submission/${id}?from=${tab}`;
  }

  function openSubmission(id: string) {
    const href = submissionHref(id);
    if (href) router.push(href);
  }

  function renderTable(
    rows: ApprovalListItem[],
    loading: boolean,
    emptyMsg: string,
  ) {
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <p className="text-sm text-gray-400 text-center py-16">{emptyMsg}</p>
      );
    }
    return (
      <>
      {/* Phones: card per submission — the five-column table needs desktop
          width, and the pending/approved tabs are the busiest lists in the app. */}
      <div className="divide-y sm:hidden">
        {rows.map((row) => (
          <button
            key={`m-${row.id}`}
            type="button"
            onClick={() => openSubmission(row.id)}
            className="flex w-full flex-col gap-1 px-3 py-3 text-left active:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-[#333]">
                {row.proposedTitle}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  row.combinedScore >= HIGH_SIMILARITY_THRESHOLD
                    ? "bg-red-50 text-red-700"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {row.combinedScore}%
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {row.studentName}
              {row.studentSrCode ? ` · ${row.studentSrCode}` : ""}
            </p>
            <p className="truncate text-xs text-gray-400">{row.groupName}</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  STATUS_STYLES[row.status] || "bg-gray-50 text-gray-600"
                }`}
              >
                {STATUS_LABELS[row.status] || row.status}
              </span>
              <span className="text-[11px] text-gray-400">
                {new Date(row.submittedAt).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Advisory Group</th>
              <th className="px-4 py-3">Proposed Title</th>
              <th className="px-4 py-3 text-center">Similarity</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => openSubmission(row.id)}
                // Warm the review route (RSC payload + its ~350 kB of JS) as
                // soon as the pointer is over the row — opening a pending or
                // approved TAF was a cold navigation otherwise.
                onMouseEnter={() => {
                  const href = submissionHref(row.id);
                  if (href) router.prefetch(href);
                }}
                className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-[#333]">{row.groupName}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[#333] line-clamp-1 max-w-[320px]">
                    {row.proposedTitle}
                  </p>
                  <p className="text-xs text-gray-400">
                    {row.studentName}
                    {row.studentSrCode ? ` · ${row.studentSrCode}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      row.combinedScore >= HIGH_SIMILARITY_THRESHOLD
                        ? "bg-red-50 text-red-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {row.combinedScore}%
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(row.submittedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[row.status] || "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        {/* Notifications bell → dropdown of the user's notifications
            (unread badge that decrements as items are viewed, max 5 shown) */}
        <NotificationBell
          initialNotifications={initialNotifications}
          initialOwnedGroupSlugs={initialOwnedGroupSlugs}
          withOwnedGroupSlugs
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${currentUser?.id}/notifications`}
          hrefFor={(n, ctx) =>
            n.submissionId
              ? // An OWNED-group submission opens inside that group — the same
                // destination the notifications page sends it to. Every other
                // submission keeps the flat review route.
                ctx.ownedGroupSlug
                ? `${rolePath(role)}/${currentUser?.id}/group/${ctx.ownedGroupSlug}/submission/${n.submissionId}`
                : `${rolePath(role)}/${currentUser?.id}/submission/${n.submissionId}`
              : // An advisory-group notice (someone joined / left) belongs on the
                // group tab, which is where the roster lives. Roles that cannot
                // own groups fall back to the TAF Submissions tab.
                (n.type === "joined_group" || n.type === "left_group") &&
                  role !== "vcrdes"
                ? `${rolePath(role)}/${currentUser?.id}?tab=groups`
                : `${rolePath(role)}/${currentUser?.id}?tab=pending`
          }
        />

        {/* User menu */}
        <UserMenu
          user={currentUser}
          userId={currentUser?.id || ""}
          routeBase={rolePath(role)}
        />
      </header>

      <div className="flex flex-1 relative">
        {/* Desktop sidebar */}
        <ApproverSidebar
          activeTab={effectiveTab}
          expanded={sidebarExpanded}
          pendingCount={pending.length}
          items={navItems}
          onSelect={setTab}
          onToggle={() => setSidebarExpanded((v) => !v)}
        />

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-14 bottom-0 z-40 w-64 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      // A granted page item (e.g. Feedback) carries a real
                      // route and NO tab — the drawer must navigate to it
                      // instead of switching an in-page tab.
                      if (item.tab) setTab(item.tab as Tab);
                      else if (item.href) router.push(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      effectiveTab === item.tab
                        ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.id === "pending" && pending.length > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                        {pending.length > 9 ? "9+" : pending.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6">
          {/* Nothing held at all — a notice, never an empty shell. */}
          {view === null && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
              <h3 className="mb-1 text-lg font-medium text-[#333]">
                No dashboard sections available
              </h3>
              <p className="max-w-md text-sm text-gray-500">
                This account has not been granted any of its role&apos;s
                permissions. Ask a department account to grant at least one.
              </p>
            </div>
          )}

          {/* ── Executive Summary (own tab, first position; DEAN only) ── */}
          {view === "executive-summary" && isExecutiveRole && (
            <ExecutiveSummary initialData={initialExecutiveSummary} />
          )}

          {/* ── Research Analytics ───────────────────────── */}
          {view === "analytics" && (
            <ResearchAnalytics role={role} userId={currentUser?.id ?? ""} initialData={initialAnalytics} />
          )}

          {/* ── Advisory Group (associate dean + dean only) ── */}
          {/* Same placement and shape as the adviser's group section, so the
              two roles manage their groups from the same kind of screen. */}
          {view === "groups" &&
            (role === "associate_dean" || role === "dean") && (
              <SupervisorAdvisoryGroups
                role={role}
                userId={currentUser?.id ?? ""}
                pendingCount={pending.length}
                userName={currentUser?.firstName}
              />
            )}

          {/* ── TAF Submissions (pending) ───────────────────── */}
          {view === "pending" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-[#333]">
                  Pending Approvals
                </h3>
                <span className="text-xs text-gray-400">
                  {pending.length} TAF(s) awaiting your decision
                </span>
              </div>
              {renderTable(
                pending,
                loadingPending,
                "No TAFs are currently routed to you for approval.",
              )}
            </div>
          )}

          {/* ── Approved TAFs ───────────────────────────────── */}
          {view === "approved" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-[#333] flex-1">
                  Approved TAFs
                </h3>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, student, group…"
                    className="w-56 rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                  />
                </div>
                {/* Year filter */}
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="rounded-lg border border-gray-200 pl-8 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                  >
                    <option value="all">All Years</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Export */}
                <button
                  type="button"
                  onClick={exportApprovedPdf}
                  disabled={exportingApproved || filteredApproved.length === 0}
                  title="Export the filtered Approved TAFs to PDF"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingApproved ? "Preparing…" : "Export"}
                </button>
              </div>
              {renderTable(
                filteredApproved,
                loadingApproved,
                "No fully approved TAFs yet. Approved TAFs appear here once the VCRDES gives final approval.",
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
