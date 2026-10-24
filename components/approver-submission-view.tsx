"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { type CurrentUser } from "@/server/actions/auth";
import { getSubmissionById, type SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import { getApproverSubmissionShell } from "@/server/actions/approver-shell";
import {
  approveSubmission,
  returnSubmission,
  markNotificationsRead,
} from "@/server/actions/approval-workflow";
import SubmissionReviewContent from "@/components/submission-review-content";
import ApproverSidebar, {
  APPROVER_NAV,
  APPROVER_NAV_WITH_EXECUTIVE_SUMMARY,
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

type Role = "associate_dean" | "dean" | "vcrdes";

export default function ApproverSubmissionView({ role }: { role: Role }) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const submissionId = String(params.submissionId || "");
  const from = searchParams.get("from");
  const activeTab: ApproverTab =
    from === "approved" ||
    from === "analytics" ||
    from === "executive-summary"
      ? (from as ApproverTab)
      : "pending";
  const isExecutiveRole = role === "dean";
  const navItems = isExecutiveRole
    ? APPROVER_NAV_WITH_EXECUTIVE_SUMMARY
    : APPROVER_NAV;

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "return" | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    setLoading(false);
    void markNotificationsRead({ submissionId })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("aithink-notifications-read"));
        }
      })
      .catch(() => {

      });
  }, [router, role, submissionId]);

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

  async function handleApprove() {
    if (!submission) return;
    setDeciding("approve");
    const result = await approveSubmission(submission.id);
    setDeciding(null);
    if (result.success) {
      toast.success(result.message);
      router.replace(`${rolePath(role)}/${currentUser?.id}?tab=pending`);
      router.refresh();
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
      toast.success(result.message);
      setShowReturnDialog(false);
      setReturnReason("");

      router.replace(`${rolePath(role)}/${currentUser?.id}?tab=pending`);
      router.refresh();
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
          <p className="text-sm text-red-600">{error || "Submission not found."}</p>
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

  const isRoutedToMe = submission.currentApproverRole === role;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
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
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>
        {}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`${rolePath(role)}/${currentUser?.id}/notifications`}
          hrefFor={(n) =>
            n.submissionId
              ? `${rolePath(role)}/${currentUser?.id}/submission/${n.submissionId}`
              : null
          }
        />
        <UserMenu
          user={currentUser}
          userId={currentUser?.id || ""}
          routeBase={rolePath(role)}
        />
      </header>

      <div className="flex flex-1 relative">
        {
}
        <ApproverSidebar
          activeTab={activeTab}
          expanded={sidebarExpanded}
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
              backLabel="Back"
              onBack={() =>
                router.push(`${rolePath(role)}/${currentUser?.id}?tab=pending`)
              }
              trackerClickable={false}
              actions={
                isRoutedToMe && submission.status !== "approved" ? (
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

      {}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              router.push(`${rolePath(role)}/${currentUser?.id}?tab=${item.tab}`)
            }
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              item.tab === activeTab
                ? "text-[#8B1A1A]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <span className="relative">
              {item.icon}
              {item.id === "pending" && pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </span>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>

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