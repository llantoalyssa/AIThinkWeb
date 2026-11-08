'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type RecentTAFEntry } from '@/server/actions/recents'
import {
  getSubmissionById,
  type SubmissionWithAnalysis,
} from '@/server/actions/group-submissions'
import SubmissionReviewContent from '@/components/submission-review-content'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import RecentTafs from '@/components/recent-tafs'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { UserMenu } from '@/components/user-menu'
import { unsubmitTAF } from '@/server/actions/approval-workflow'
import { toast } from 'sonner'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  AlertCircle,
  CheckCircle2 as CheckCircle2Icon,
  Undo2,
  Archive as ArchiveIcon,
} from 'lucide-react' 

/** Student nav items come from the ONE shared source (components/nav-items.tsx).
 *  Two things stay caller-side by design: the unread NOTIFICATIONS badge
 *  (wiring keyed on item.id) and the href, which studentItems() always sets. */
type StudentNavItem = NavItem & { href: string; badge?: number };

type Props = {
  /** Supplied by the SERVER (see page.tsx): identity, the submission record,
   *  the notification badge and the sidebar recents. Nothing is fetched on
   *  mount any more — the four queued round trips are gone. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialSubmission: SubmissionWithAnalysis | null;
  initialError: string | null;
  /** Absent when the server fetch failed — the child then loads its own. */
  initialRecents?: RecentTAFEntry[];
  /** The group this TAF belongs to is ARCHIVED → read-only, no export. */
  groupArchived?: boolean;
};

export default function StudentSubmissionViewPage({
  initialUser,
  initialUnreadCount,
  initialSubmission,
  initialError,
  initialRecents,
  groupArchived = false,
}: Props) {
  const router = useRouter();
  const params = useParams<{ id: string; slug: string; submissionId: string }>();
  const userId = params.id;
  const groupSlug = params.slug;
  const submissionId = params.submissionId;

  const unreadCount = useUnreadNotifications(userId, initialUnreadCount);

  // The student's five items come from the ONE shared source.
  const navItems: StudentNavItem[] = navItemsFor({ role: 'student', userId }).map(
    (item): StudentNavItem => ({
      ...item,
      href: item.href ?? '',
      badge: item.id === 'notifications' ? unreadCount : undefined,
    }),
  );

  const currentUser: CurrentUser | null = initialUser;
  const loading = false;
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(initialSubmission);
  const error = initialError;

  // The submission arrives with the first render (fetched in page.tsx), so the
  // identity/role/URL-id guards and the initial load are no longer client work.

  // Live status reflection: when an approver approves/returns, the student's
  // view auto-updates (status, current approver, tracker) without a refresh.
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await getSubmissionById(submissionId);
      if (result.success) setSubmission(result.data);
    }, 6000);
    return () => clearInterval(id);
  }, [submissionId]);

  useEffect(() => {
    function handleResize() { if (window.innerWidth >= 768) setMobileMenuOpen(false); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function goBack() { router.push(`/dashboard/student/${userId}/group/${groupSlug}`); }

  const [unsubmitting, setUnsubmitting] = useState(false);

  async function handleUnsubmit() {
    if (!submission) return;
    if (!window.confirm('Unsubmit this TAF? It will be removed from the approval flow and your advisory group.')) {
      return;
    }
    setUnsubmitting(true);
    const result = await unsubmitTAF(submission.id);
    setUnsubmitting(false);
    if (result.success) {
      toast.success('TAF unsubmitted.');
      goBack();
    } else {
      toast.error(result.error);
    }
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
        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/student" />
      </header>

      <div className="flex flex-1 relative">
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${sidebarExpanded ? 'w-64' : 'w-16'} shrink-0`}>
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => router.push(item.href)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.id === 'advisory-group' ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} ${sidebarExpanded ? '' : 'justify-center'} cursor-pointer`}
                title={item.label}>
                {item.icon}{sidebarExpanded && <span>{item.label}</span>}
                {item.badge ? (
                  <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ${sidebarExpanded ? '' : 'absolute right-1.5 top-1.5'}`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          {sidebarExpanded && (
            <div className="flex-1 min-h-0 overflow-hidden border-t border-gray-100 mt-2 pt-1">
              <RecentTafs userId={userId} initialEntries={initialRecents} />
            </div>
          )}
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
                  <button key={item.id} onClick={() => { router.push(item.href); setMobileMenuOpen(false); }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.id === 'advisory-group' ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} cursor-pointer`}>
                    {item.icon}<span>{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
            {/* ── Shared review content (uniform across all roles) ── */}
            {groupArchived && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <ArchiveIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This advisory group has been archived. You can still read the
                  submitted TAF, but exporting and further changes are
                  unavailable — leave the group from the Advisory Group page to
                  join a new one.
                </span>
              </div>
            )}
            <SubmissionReviewContent
              submission={submission}
              hideExport={groupArchived}
              /* Archived group → comments are closed too, matching the adviser
                 and approver views of the same submission. */
              allowComments={!groupArchived}
              editable={
                submission.submittedBy === currentUser?.id &&
                submission.status !== 'approved' &&
                // Archived group → read-only. Editing here would be refused by
                // the server anyway (resubmitTAF), so the fields are not opened.
                !groupArchived
              }
              backLabel="Back to group"
              onBack={goBack}
              actions={
                submission.status === 'revisions_needed' &&
                submission.submittedBy === currentUser?.id ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle2Icon className="h-3.5 w-3.5 text-amber-500" />
                    Returned for revision — edit the content below, then
                    click Save &amp; Resubmit.
                  </div>
                ) : submission.status === 'approved' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 border border-green-200 px-3 py-1 text-xs font-semibold">
                    <CheckCircle2Icon className="h-3.5 w-3.5" /> Fully Approved
                  </span>
                ) : undefined
              }
            />

            {/* ── Unsubmit (student owner only, unless fully approved) ── */}
            {submission.submittedBy === currentUser?.id &&
              submission.status !== 'approved' &&
              !groupArchived && (
                <div className="mt-2 flex justify-start">
                  <button
                    type="button"
                    onClick={handleUnsubmit}
                    disabled={unsubmitting}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {unsubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4" />
                    )}
                    Unsubmit TAF
                  </button>
                </div>
              )}
          </div>
        </main>
      </div>


      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  );
}