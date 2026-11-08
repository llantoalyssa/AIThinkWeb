"use client";
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
  backHref?: string
  backLabel?: string
}) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const submissionId = String(params.submissionId || "");
  const from = searchParams.get("from");
  const pathname = usePathname();
  const inGroupContext = pathname?.includes("/group/") ?? false;
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
  const fromApprovedPage = from === "approved-page";
  const originBackHref = fromApprovedPage
    ? `${rolePath(role)}/${currentUser?.id ?? ""}/approved`
    : `${rolePath(role)}/${currentUser?.id}?tab=${originTab()}`;
  const originBackLabel = fromApprovedPage
    ? "Back to Approved TAFs"
    : "Back to TAF Submissions";
  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(null);

  const [initialAnnotations, setInitialAnnotations] = useState<Annotation[] | null>(null);
  const [initialCanComment, setInitialCanComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "return" | null>(null);
  const [decisionMade, setDecisionMade] = useState<"approved" | "returned" | null>(
    null,
  );
  const [returnReason, setReturnReason] = useState("");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const navItems = approverNavItemsFor(
    role,
    currentUser?.id ?? "",
    permissions,
  );
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
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
    setInitialAnnotations(shell.annotations);
    setInitialCanComment(shell.canComment);
    setPermissions(shell.permissions);
    setLoading(false);
    void markNotificationsRead({ submissionId })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("aithink-notifications-read"));
        }
      })
      .catch(() => {

      });
  }, [router, role, submissionId, setCurrentUser]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await getSubmissionById(submissionId);
      if (result.success) setSubmission(result.data);
    }, 6000);
    return () => clearInterval(id);
  }, [submissionId]);
  async function refreshInPlace() {
    if (!submission) return;
    const fresh = await getSubmissionById(submission.id);
    if (fresh.success) setSubmission(fresh.data);
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
        {}
        <NotificationBell
          withOwnedGroupSlugs
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${currentUser?.id}/notifications`}
          hrefFor={(n, ctx) =>
            n.submissionId
              ?
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
        {
}
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
            {}
            <SubmissionReviewContent
              submission={submission}
              backLabel={backLabel ?? originBackLabel}
              initialAnnotations={initialAnnotations}
              initialCanComment={initialCanComment}
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

      {}
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