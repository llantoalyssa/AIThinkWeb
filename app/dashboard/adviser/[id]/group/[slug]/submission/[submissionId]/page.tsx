'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getAdviserSubmissionData } from '@/server/actions/adviser-shell'
import { UserMenu } from '@/components/user-menu'
import {
  getSubmissionById,
  type SubmissionWithAnalysis,
} from '@/server/actions/group-submissions'
import ApprovalActions from '@/components/approval-actions'
import SubmissionReviewContent from '@/components/submission-review-content'
import AdviserApprovalBell from '@/components/adviser-approval-bell'
import { getMyNotifications } from '@/server/actions/approval-workflow'
import {
  BarChart3,
  Bell,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  AlertCircle,
} from 'lucide-react'

type NavItem = {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
};

export default function AdviserSubmissionViewPage() {
  const router = useRouter();
  const params = useParams<{ id: string; slug: string; submissionId: string }>();
  const userId = params.id;
  const groupSlug = params.slug;
  const submissionId = params.submissionId;

  const navItems: NavItem[] = [
    { icon: <BarChart3 className="h-5 w-5" />, label: "Dashboard", href: `/dashboard/adviser/${userId}` },
    { icon: <Bell className="h-5 w-5" />, label: "Notifications", href: `/dashboard/adviser/${userId}/notifications` },
  ];

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refreshUnread() {
      const res = await getMyNotifications();
      if (!cancelled && res.success) {
        setUnreadCount(res.data.filter((n) => !n.readAt).length);
      }
    }
    function onRead() { void refreshUnread(); }
    function onFocus() { void refreshUnread(); }
    window.addEventListener('aithink-notifications-read', onRead);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('aithink-notifications-read', onRead);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);

  const [submission, setSubmission] = useState<SubmissionWithAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const data = await getAdviserSubmissionData(submissionId);
      if (!data.success) { router.replace('/login'); return; }
      const userResult = data.user;
      if (userResult.role !== 'adviser') { router.replace(`/dashboard/${userResult.role}/${userResult.id}`); return; }
      if (userId !== userResult.id) { router.replace(`/dashboard/adviser/${userResult.id}/group/${groupSlug}/submission/${submissionId}`); return; }
      setCurrentUser(userResult);
      setUnreadCount(data.unreadCount);
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

  function goBack() { router.push(`/dashboard/adviser/${userId}/group/${groupSlug}`); }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" /></div>;
  }

  if (error || !submission) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error || 'Submission not found.'}</p>
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
        <button onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>
        {}
        <AdviserApprovalBell
          adviserId={userId}
          routerPush={(href) => router.push(href)}
          routeBase={`/dashboard/adviser/${userId}`}
        />
        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/adviser" />
      </header>

      <div className="flex flex-1 relative">
        <aside className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${sidebarExpanded ? 'w-48' : 'w-16'} shrink-0`}>
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => {
              const isNotif = item.label === 'Notifications';
              const count = isNotif ? unreadCount : 0;
              return (
                <button key={item.label} onClick={() => item.href && router.push(item.href)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.active ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} ${sidebarExpanded ? '' : 'justify-center'} ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                  title={item.label} disabled={!item.href}>
                  <span className="relative">
                    {item.icon}
                    {isNotif && count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </span>
                  {sidebarExpanded && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-56 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button key={item.label} onClick={() => { if (item.href) router.push(item.href); setMobileMenuOpen(false); }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.active ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    disabled={!item.href}>
                    <span className="relative">
                      {item.icon}
                      {item.label === 'Notifications' && unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
            {}
            <SubmissionReviewContent
              submission={submission}
              backLabel={`Back to ${submission.groupName || groupSlug}`}
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

      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button key={item.label}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${item.active ? 'text-[#8B1A1A]' : 'text-gray-400 hover:text-gray-600'}`}>
            {item.icon}<span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>

      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  );
}