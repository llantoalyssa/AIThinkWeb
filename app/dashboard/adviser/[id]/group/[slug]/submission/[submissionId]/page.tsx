'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getAdviserSubmissionData } from '@/server/actions/adviser-shell'
import { UserMenu } from '@/components/user-menu'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import { navItemsFor } from "@/components/nav-items";
import { getMyGrantedPermissions } from "@/server/actions/permissions";
import {
  getSubmissionById,
  type SubmissionWithAnalysis,
} from '@/server/actions/group-submissions'
import ApprovalActions from '@/components/approval-actions'
import SubmissionReviewContent from '@/components/submission-review-content'
import AdviserApprovalBell from '@/components/adviser-approval-bell'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  AlertCircle,
} from 'lucide-react'



export default function AdviserSubmissionViewPage() {
  const router = useRouter();
  const params = useParams<{ id: string; slug: string; submissionId: string }>();
  const userId = params.id;
  const searchParams = useSearchParams();
  const groupSlug = params.slug;
  const submissionId = params.submissionId;

  // THE shared source, permission-filtered — the same list the dashboard, the
  // Pending TAFs page and every other adviser surface renders. The hand-rolled
  // two-item version that used to live here is why a granted page (Research
  // Analytics, Approved TAF, Journals) vanished the moment you opened a TAF
  // from the Pending list.
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);
  const navItems = navItemsFor({ role: "adviser", userId, permissions });

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyGrantedPermissions().then((keys) => {
      if (!cancelled) setPermissions(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // ONE round trip. This used to be getCurrentUser() → getSubmissionById()
      // (two sequential waits) plus a separate unread-count call — three queued
      // browser round trips. The bundle resolves all three in parallel
      // server-side.
      const data = await getAdviserSubmissionData(submissionId);
      if (!data.success) { router.replace('/login'); return; }
      const userResult = data.user;
      if (userResult.role !== 'adviser') { router.replace(`/dashboard/${userResult.role}/${userResult.id}`); return; }
      if (userId !== userResult.id) { router.replace(`/dashboard/adviser/${userResult.id}/group/${groupSlug}/submission/${submissionId}`); return; }
      setCurrentUser(userResult);
      if (data.submission) setSubmission(data.submission);
      else setError(data.submissionError);
      setLoading(false);
    }
    init();
  }, [router, userId, groupSlug, submissionId]);

  async function reloadSubmission() {
    const result = await getSubmissionById(submissionId);
    if (result.success) setSubmission(result.data);
  }

  // Light polling: pick up the student's Saved edits on a returned /
  // in-flight submission so the adviser sees them without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => {
      void reloadSubmission();
    }, 6000);
    return () => clearInterval(id);
  }, [submissionId]);

  useEffect(() => {
    function handleResize() { if (window.innerWidth >= 768) setMobileMenuOpen(false); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Rows on the adviser's Approved TAF page carry ?from=approved-page; Back must
  // return there rather than to the group (the list the reader actually came from).
  const fromApprovedPage = searchParams.get("from") === "approved-page";
  const backLabel = fromApprovedPage
    ? "Back to Approved TAFs"
    : `Back to ${submission?.groupName || groupSlug}`;
  function goBack() {
    router.push(
      fromApprovedPage
        ? `/dashboard/adviser/${userId}/approved`
        : `/dashboard/adviser/${userId}/group/${groupSlug}`,
    );
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" /></div>;
  }

  if (error || !submission) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error || 'TAF has been routed.'}</p>
          <button onClick={goBack} className="mt-4 text-sm text-[#8B1A1A] hover:underline cursor-pointer">Back to group</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
       
        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>
        {/* Notifications bell (shared, in sync with the dashboard) */}
        <AdviserApprovalBell
          adviserId={userId}
          routerPush={(href) => router.push(href)}
          routeBase={`/dashboard/adviser/${userId}`}
        />
        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/adviser" />
      </header>

      <div className="flex flex-1 relative">
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${sidebarExpanded ? 'w-64' : 'w-16'} shrink-0`}>
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => item.href && router.push(item.href)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${sidebarExpanded ? '' : 'justify-center'} ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                title={item.label}
                disabled={!item.href}
              >
                {item.icon}
                {sidebarExpanded && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </nav>
        </aside>
          <SidebarCollapseHandle
            expanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-14 bottom-0 z-40 w-64 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.href) router.push(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    disabled={!item.href}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
            {/* ── Shared review content (uniform across roles) ── */}
            <SubmissionReviewContent
              submission={submission}
              backLabel={backLabel}
              onBack={goBack}
              actions={
                submission.currentApproverRole === "adviser" ? (
                  <ApprovalActions
                    submissionId={submission.id}
                    onDecided={reloadSubmission}
                  />
                ) : undefined
              }
            />
          </div>
        </main>
      </div>


      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  );
}
