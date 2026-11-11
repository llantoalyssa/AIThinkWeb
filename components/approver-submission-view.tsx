"use client";

// ============================================================
// ApproverSubmissionView — shared submission review page for
// Associate Dean / Dean / VCRDES. Loads the submission, lets the
// approver review the TAF content + analysis, then Approve or
// Return (with a reason). Includes the submission chat.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams, usePathname } from "next/navigation";
import { type CurrentUser } from "@/server/actions/auth";
import { getSubmissionById, type SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import { type Annotation } from "@/server/actions/submission-annotations";
import { getApproverSubmissionShell } from "@/server/actions/approver-shell";
import {
  approveSubmission,
  returnSubmission,
  markNotificationsRead,
} from "@/server/actions/approval-workflow";
import SubmissionReviewContent from "@/components/submission-review-content";
import ApproverSidebar, {
  approverNavItemsFor,
  type ApproverTab,
} from "@/components/approver-sidebar";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import { rolePath } from "@/lib/constants";
import {
  LogOut,
  Loader2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type Role = "associate_dean" | "dean" | "vcrdes" | "department";

export default function ApproverSubmissionView({
  role,
  backHref,
  backLabel,
}: {
  role: Role
  /** Where "back" goes. Defaults to the role's TAF Submissions tab; the
   *  group-scoped route passes the group so back returns to the group. */
  backHref?: string
  backLabel?: string
}) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const submissionId = String(params.submissionId || "");
  // Which dashboard tab the approver came from (pending / approved /
  // analytics / executive-summary). The sidebar/bottom-nav highlight follows
  // this so navigation stays in sync — it used to collapse everything except
  // "approved" to "pending", which highlighted the wrong item for the dean.
  const from = searchParams.get("from");
  const pathname = usePathname();
  // A TAF opened from INSIDE an advisory group keeps "Advisory Group"
  // highlighted: the group is where the user came from, and that is true
  // whatever ?from says. The route shape is the signal — these URLs carry no
  // query string — e.g.
  // /dashboard/associate-dean/<id>/group/<slug>/submission/<id>
  const inGroupContext = pathname?.includes("/group/") ?? false;

  /**
   * WHICH tab Back returns to.
   *
   * The list row that opened this TAF carries `?from=<tab>`
   * (components/approver-dashboard.tsx → submissionHref), so an Approved TAF
   * opened from the Approved tab returns to Approved instead of always landing
   * on Pending. A direct/bookmarked entry has no `from`, and then — and only
   * then — the role-appropriate default applies.
   */
  function originTab(): string {
    const explicit = ["pending", "approved", "analytics", "executive-summary"];
    if (from && explicit.includes(from)) return from;
    if (from === "groups" || inGroupContext) return "groups";
    return "pending";
  }
  const activeTab: ApproverTab = inGroupContext
    ? "groups"
    : from === "approved" ||
        from === "analytics" ||
        from === "executive-summary"
      ? (from as ApproverTab)
      : "pending";

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  /**
   * Rows on the standalone Approved TAF page carry `?from=approved-page`, which
   * is NOT the same surface as `?from=approved` (the Approved tab of TAF
   * Submissions). Without this distinction Back always landed on the queue.
   * Declared after `currentUser` — it is part of the href.
   */
  const fromApprovedPage = from === "approved-page";
  const originBackHref = fromApprovedPage
    ? `${rolePath(role)}/${currentUser?.id ?? ""}/approved`
    : `${rolePath(role)}/${currentUser?.id}?tab=${originTab()}`;
  const originBackLabel = fromApprovedPage
    ? "Back to Approved TAFs"
    : "Back to TAF Submissions";
  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(null);
  // Seeded from the shell so the comment badge is right on first paint.
  const [initialAnnotations, setInitialAnnotations] = useState<Annotation[] | null>(null);
  const [initialCanComment, setInitialCanComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "return" | null>(null);
  /**
   * A decision was just made from THIS page. The page stays open (no redirect),
   * and a REFETCH may legitimately be refused afterwards — a returned TAF goes
   * back to the student, which removes the approver's read access under RLS. So
   * the buttons are hidden from this flag as well, rather than relying on the
   * refreshed data alone; otherwise a refusal would leave Approve clickable.
   */
  const [decisionMade, setDecisionMade] = useState<"approved" | "returned" | null>(
    null,
  );
  const [returnReason, setReturnReason] = useState("");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** Effective permission keys for this account, seeded by the shell — the nav
   *  uses them to show a GRANTED department page. Empty = today's nav. */
  const [permissions, setPermissions] = useState<string[]>([]);

  // SAME role-aware list as the dashboard's side nav — including Advisory Group,
  // whose href the shared source builds from the role + user id — so every page
  // of these roles shows an identical nav. The permission set arrives with the
  // shell, so a GRANTED department page (Feedback) does not disappear from the
  // nav merely because a TAF was opened.
  const navItems = approverNavItemsFor(
    role,
    currentUser?.id ?? "",
    permissions,
  );

  // Pending TAFs still routed to this approver — keeps the "TAF Submissions"
  // sidebar badge visible here too (it was shown on the dashboard but vanished
  // on this page because no pendingCount was passed to ApproverSidebar).
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    // ONE request instead of the old chain: getCurrentUser → getSubmissionById
    // → AWAITED markNotificationsRead → a separate getPendingApprovals effect.
    // Server actions are queued, so that was four authenticated round trips
    // (and a full-page spinner) before this page rendered — the submission
    // payload is the heaviest in the app, which is why opening a pending or
    // approved TAF took 5-8s.
    const shell = await getApproverSubmissionShell(submissionId);

    if (!shell.success) {
      if (shell.unauthenticated) {
        router.replace("/login");
        return;
      }
      setError(shell.error);
      setLoading(false);
      return;
    }

    const user = shell.user;
    if (user.role !== role) {
      router.replace(`${rolePath(user.role)}/${user.id}`);
      return;
    }

    setCurrentUser(user);
    setSubmission(shell.submission);
    setPendingCount(shell.pendingCount);
    // Comment threads arrived WITH the shell, so the comment badge is correct
    // the moment the TAF paints rather than a round trip later.
    setInitialAnnotations(shell.annotations);
    setInitialCanComment(shell.canComment);
    setPermissions(shell.permissions);
    setLoading(false);

    // Marking this submission's notifications read is cosmetic — it must never
    // hold up the render (it used to be awaited in the middle of the load).
    void markNotificationsRead({ submissionId })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("aithink-notifications-read"));
        }
      })
      .catch(() => {
        // cosmetic — ignore
      });
    // `setCurrentUser` is called inside but is a stable setter; the React
    // Compiler requires it to be listed or it refuses to compile the component
    // (a build-failing lint error at this repo's settings).
  }, [router, role, submissionId, setCurrentUser]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // The "TAF Submissions" sidebar badge count now arrives with the shell above
  // (same number the dashboard shows), so the separate getPendingApprovals()
  // mount request is gone.

  // Light polling: pick up the student's Saved edits on the returned /
  // in-flight submission without a manual refresh (skip the full auth check
  // on each tick — just refetch the submission body).
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await getSubmissionById(submissionId);
      if (result.success) setSubmission(result.data);
    }, 6000);
    return () => clearInterval(id);
  }, [submissionId]);

  /**
   * Refresh THIS page after a decision — never navigate away.
   *
   * Approving or returning used to bounce the approver to their TAF list, so
   * they lost the TAF they had just read (and, when a student's edit needed a
   * second look, the whole context). The decision is persisted either way, so
   * the page can simply reload its own submission: the tracker repaints with the
   * new step, the Approve/Return buttons disappear because it is no longer
   * routed to this account, and the toast confirms what happened.
   */
  async function refreshInPlace() {
    if (!submission) return;
    const fresh = await getSubmissionById(submission.id);
    if (fresh.success) setSubmission(fresh.data);
    // Keeps server-rendered chrome (nav badge counts) in step without leaving
    // the route.
    router.refresh();
  }

  async function handleApprove() {
    if (!submission) return;
    setDeciding("approve");
    const result = await approveSubmission(submission.id);
    setDeciding(null);
    if (result.success) {
      setDecisionMade("approved");
      toast.success(result.message);
      await refreshInPlace();
    } else {
      toast.error(result.error);
    }
  }

  async function handleReturn() {
    if (!submission || !returnReason.trim()) return;
    setDeciding("return");
    const result = await returnSubmission(submission.id, returnReason.trim());
    setDeciding(null);
    if (result.success) {
      setDecisionMade("returned");
      toast.success(result.message);
      setShowReturnDialog(false);
      setReturnReason("");
      // Stay on the TAF: the tracker now shows it back with the student.
      await refreshInPlace();
    } else {
      toast.error(result.error);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error || "TAF has been routed."}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-[#8B1A1A] hover:underline cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // If the viewer OWNS this group they are its entry-level approver: the TAF is
  // routed to "adviser", never to their own role, so a plain role comparison
  // would hide the Approve/Return buttons on their own group's submissions.
  //
  // The DEPARTMENT is the OPTIONAL approver: it has NO step of its own (no
  // current_approver_role value is ever "department"), so the plain comparison
  // always fails for it even though it may act on any step. It therefore sees
  // the buttons whenever a step is actually pending — no step, no buttons.
  const isOwner = !!submission.groupAdviserId && submission.groupAdviserId === currentUser?.id;
  const isDepartment = (currentUser?.role ?? role) === "department";
  const isRoutedToMe =
    submission.currentApproverRole === role ||
    (submission.currentApproverRole === "adviser" && isOwner) ||
    (isDepartment && !!submission.currentApproverRole);

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
        {/* Notification badge beside the user menu (same as the dashboard) */}
        <NotificationBell
          withOwnedGroupSlugs
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${currentUser?.id}/notifications`}
          hrefFor={(n, ctx) =>
            n.submissionId
              ? // An OWNED-group submission opens inside that group — the same
                // destination the notifications page and the dashboard send it
                // to. Everything else keeps the flat review route.
                ctx.ownedGroupSlug
                ? `${rolePath(role)}/${currentUser?.id}/group/${ctx.ownedGroupSlug}/submission/${n.submissionId}`
                : `${rolePath(role)}/${currentUser?.id}/submission/${n.submissionId}`
              : null
          }
        />
        <UserMenu
          user={currentUser}
          userId={currentUser?.id || ""}
          routeBase={rolePath(role)}
        />
      </header>

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
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      if (item.href) {
                        router.push(item.href);
                        return;
                      }
                      if (item.tab) {
                        router.push(`${rolePath(role)}/${currentUser?.id}?tab=${item.tab}`);
                      }
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

      <div className="flex flex-1 relative">
        {/* Sidebar — same nav as the dashboard. Clicking any item goes to
            that dashboard tab (with ?tab= so it lands on the right page). */}
        <ApproverSidebar
          activeTab={activeTab}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded((v) => !v)}
          pendingCount={pendingCount}
          items={navItems}
          onSelect={(tab) =>
            router.push(`${rolePath(role)}/${currentUser?.id}?tab=${tab}`)
          }
        />

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
            {/* ── Shared review content (uniform across roles) ── */}
            <SubmissionReviewContent
              submission={submission}
              backLabel={backLabel ?? originBackLabel}
              initialAnnotations={initialAnnotations}
              initialCanComment={initialCanComment}
              // The department reviews and decides; it does not annotate.
              /* Archived group → no comments for ANY role: its TAFs are
                 read-only history and out of the approval queues. */
              allowComments={role !== "department" && !submission.groupArchived}
              onBack={() =>
                router.push(backHref ?? originBackHref)
              }
              trackerClickable={false}
              actions={
                !decisionMade &&
                isRoutedToMe &&
                submission.status !== "approved" ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={deciding !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deciding === "approve" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReturnDialog(true)}
                      disabled={deciding !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Return for Revision
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>
        </main>
      </div>


      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {/* Return dialog */}
      {showReturnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowReturnDialog(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#333] mb-1">Return TAF for Revision</h3>
            <p className="text-xs text-gray-500 mb-4">
              The TAF will be sent back to the student. They can edit and resubmit it.
            </p>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Reason for returning (e.g., objectives need refinement, add more related literature)…"
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowReturnDialog(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReturn}
                disabled={deciding === "return" || !returnReason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deciding === "return" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Return TAF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
