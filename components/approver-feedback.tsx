"use client";

// ============================================================
// ApproverFeedbackPage — the shared Feedback list rendered inside an APPROVER's
// own chrome (associate dean / dean / vcrdes), for an account the department
// console granted "pages.feedback".
//
// WHY A SHARED COMPONENT: the route file only names the role and its id; the
// shell (header + the role-aware side nav) lives here so the three approver
// routes cannot drift apart in the way nav-items.tsx was created to stop.
//
// The chrome is the DASHBOARD's chrome on purpose — same header, same
// ApproverSidebar with the same permission-aware item list — so moving between
// the dashboard and Feedback does not change the navigation under the user.
//
// The page does no data fetching of its own: DepartmentFeedback owns the list
// (and its pagination) and calls the permission-aware listAllFeedback().
// ============================================================

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { type CurrentUser } from "@/server/actions/auth";
import { getApproverFeedbackShell } from "@/server/actions/approver-shell";
import ApproverSidebar, {
  approverNavItemsFor,
  type ApproverTab,
} from "@/components/approver-sidebar";
import DepartmentFeedback from "@/components/department-feedback";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import { rolePath } from "@/lib/constants";
import { Loader2, Menu, X, ChevronLeft, ChevronRight } from "lucide-react";

export default function ApproverFeedbackPage({
  role,
  urlUserId,
  onBack,
}: {
  /**
   * The adviser is included because the department console can grant
   * `pages.feedback` to an adviser too — without this the granted item could
   * only ever 404 for that role.
   */
  role: "adviser" | "associate_dean" | "dean" | "vcrdes";
  urlUserId: string;
  /** Where "back" goes when this page is not reachable (the role's dashboard). */
  onBack: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  // Seeded by the shell: the nav needs the SAME effective set the dashboard
  // uses, otherwise the granted Feedback item would vanish on this very page.
  const [permissions, setPermissions] = useState<string[]>([]);
  const [canView, setCanView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // ONE bundled call — identity + effective permissions.
      const shell = await getApproverFeedbackShell();
      if (cancelled) return;
      if (!shell.success) {
        router.replace("/login");
        return;
      }
      const u = shell.user;
      // Wrong role, or someone else's id in the URL → their own dashboard.
      if (u.role !== role || (urlUserId && u.id !== urlUserId)) {
        router.replace(`${rolePath(u.role)}/${u.id}`);
        return;
      }
      setUser(u);
      setPermissions(shell.permissions);
      // Ungranted is a normal outcome (a hand-typed URL): show the notice
      // instead of an empty list. RLS + the list action refuse it regardless.
      setCanView(shell.canView);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, role, urlUserId]);

  // Same permission-aware list the dashboard renders. Omitting `activeTab` is
  // deliberate: this page is not one of the tab items, and the granted page
  // item (the only item with no tab) is the one that highlights.
  const navItems = approverNavItemsFor(
    role,
    user?.id ?? urlUserId,
    permissions,
  );

  // Both nav surfaces navigate: a tab item → that dashboard tab, a granted page
  // item → its own route (the href nav-items gave it, re-pointed at this role).
  function goTo(item: { tab?: string; href?: string }) {
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (item.tab) router.push(`${rolePath(role)}/${urlUserId}?tab=${item.tab}`);
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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        <NotificationBell
          withOwnedGroupSlugs
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${urlUserId}/notifications`}
          hrefFor={(n, ctx) =>
            n.submissionId
              ? ctx.ownedGroupSlug
                ? `${rolePath(role)}/${urlUserId}/group/${ctx.ownedGroupSlug}/submission/${n.submissionId}`
                : `${rolePath(role)}/${urlUserId}/submission/${n.submissionId}`
              : (n.type === "joined_group" || n.type === "left_group") &&
                  role !== "vcrdes"
                ? `${rolePath(role)}/${urlUserId}?tab=groups`
                : `${rolePath(role)}/${urlUserId}?tab=pending`
          }
        />

        <UserMenu
          user={user}
          userId={user?.id || urlUserId}
          routeBase={rolePath(role)}
        />
      </header>

      <div className="flex flex-1 relative">
        {/* Desktop sidebar — the dashboard's own, permission-aware item list */}
        <ApproverSidebar
          expanded={sidebarExpanded}
          items={navItems}
          onSelect={(tab: ApproverTab) => goTo({ tab })}
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
                      goTo(item);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      /* Must match THIS page, not merely "has a route" —
                         `!item.tab && item.href` lit every routed item at once
                         (Journals AND Feedback AND Audit Trail) on mobile. */
                      !!item.href && item.href === pathname
                        ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left truncate">{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
              User Feedback
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Feedback submitted by users across the system.
            </p>
          </div>

          {canView ? (
            // The SAME component the department dashboard renders — one list,
            // one pagination. Delete is the department's alone (deleteFeedback
            // is department-only), so a granted viewer is NOT shown a button
            // that is guaranteed to fail.
            <DepartmentFeedback canDelete={false} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
              <h3 className="text-lg font-medium text-[#333] mb-1">
                No access to Feedback
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Your account has not been granted the Feedback page. Ask a
                department account to grant it.
              </p>
              <button
                onClick={onBack}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
