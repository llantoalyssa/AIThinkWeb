"use client";
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
  APPROVER_NAV,
  APPROVER_NAV_WITH_EXECUTIVE_SUMMARY,
} from "@/components/approver-sidebar";
import ResearchAnalytics from "@/components/research-analytics";
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

type Tab = "analytics" | "pending" | "approved" | "executive-summary";

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
  const requestedTab = searchParams.get("tab");
  const tab: Tab =
    requestedTab === "analytics" ||
    requestedTab === "pending" ||
    requestedTab === "approved" ||
    requestedTab === "executive-summary"
      ? (requestedTab as Tab)
      : role === "dean"
        ? "executive-summary"
        : "analytics";
  const setTab = useCallback(
    (next: Tab) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", next);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );
  const isExecutiveRole = role === "dean";
  const navItems = isExecutiveRole
    ? APPROVER_NAV_WITH_EXECUTIVE_SUMMARY
    : APPROVER_NAV;

  const effectiveTab: Tab =
    tab === "executive-summary" && !isExecutiveRole ? "analytics" : tab;

  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [pending, setPending] = useState<ApprovalListItem[]>([]);
  const [approved, setApproved] = useState<ApprovalListItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const loadingApproved = false;
  const [initialNotifications, setInitialNotifications] = useState<
    ApprovalNotification[] | undefined
  >(undefined);
  const [initialAnalytics, setInitialAnalytics] = useState<
    AnalyticsData | null | undefined
  >(undefined);
  const [initialExecutiveSummary, setInitialExecutiveSummary] = useState<
    ExecutiveSummaryData | null | undefined
  >(undefined);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [exportingApproved, setExportingApproved] = useState(false);
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
      setInitialAnalytics(shell.analytics);
      setInitialExecutiveSummary(shell.executiveSummary);
      setLoading(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router, role]);
  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    const result = await getPendingApprovals();
    if (result.success) setPending(result.data);
    setLoadingPending(false);
  }, []);
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
      <div className="overflow-x-auto">
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
    );
  }
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        {
}
        <NotificationBell
          initialNotifications={initialNotifications}
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${currentUser?.id}/notifications`}
          hrefFor={(n) =>
            n.submissionId
              ? `${rolePath(role)}/${currentUser?.id}/submission/${n.submissionId}`
              :

                `${rolePath(role)}/${currentUser?.id}?tab=pending`
          }
        />

        {}
        <UserMenu
          user={currentUser}
          userId={currentUser?.id || ""}
          routeBase={rolePath(role)}
        />
      </header>

      <div className="flex flex-1 relative">
        {}
        <ApproverSidebar
          activeTab={effectiveTab}
          expanded={sidebarExpanded}
          pendingCount={pending.length}
          items={navItems}
          onSelect={setTab}
        />

        {}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-56 bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTab(item.tab);
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

        {}
        <main className="flex-1 p-4 md:p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#333]">
              {ROLE_TITLE[role]} Dashboard
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Welcome back, {currentUser?.firstName || "User"} — review and decide
              on submitted TAFs routed to you.
            </p>
          </div>

          {}
          {effectiveTab === "executive-summary" && isExecutiveRole && (
            <ExecutiveSummary initialData={initialExecutiveSummary} />
          )}

          {}
          {effectiveTab === "analytics" && (
            <ResearchAnalytics role={role} initialData={initialAnalytics} />
          )}

          {}
          {tab === "pending" && (
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

          {}
          {tab === "approved" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-[#333] flex-1">
                  Approved TAFs
                </h3>
                {}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, student, group…"
                    className="w-56 rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                  />
                </div>
                {}
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
                {}
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