'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams, usePathname } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type StudentDashboardData } from '@/server/actions/student-dashboard'
import { type RecentTAFEntry } from '@/server/actions/recents'
import { formatName } from '@/lib/constants'
import { joinGroupByCode } from '@/server/actions/advisory-groups'
import { getMyNotifications } from '@/server/actions/approval-workflow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import RecentTafs from '@/components/recent-tafs'
import StudentStatsDashboard from '@/components/student-stats-dashboard'
import {
  LogOut,
  User,
  Mail,
  FilePlus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  BookOpen,
  Users,
  Home,
  UserCheck,
  Star,
  Bell,
} from 'lucide-react'

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
};

type Props = {
  /** Supplied by the SERVER (see page.tsx): identity, the notification badge,
   *  advisory-group membership, the sidebar recents and the stats dashboard
   *  data. Passing them down means this page fires ZERO data round trips on
   *  mount — everything arrives with the RSC payload. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialHasGroup: boolean;
  /** Absent when the server fetch failed — the child then loads its own. */
  initialRecents?: RecentTAFEntry[];
  initialDashboardData: StudentDashboardData | null;
};

export default function StudentDashboardPage({
  initialUser,
  initialUnreadCount,
  initialHasGroup,
  initialRecents,
  initialDashboardData,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const urlUserId = params.id;

  // Unread notifications count (badge on the Notifications nav item).
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: <Home className="h-5 w-5" />, label: 'Dashboard', href: `/dashboard/student/${urlUserId}` },
    { id: 'taf', icon: <FilePlus className="h-5 w-5" />, label: 'Topic Abstract Form', href: `/dashboard/student/${urlUserId}/taf` },
    { id: 'advisory-group', icon: <Users className="h-5 w-5" />, label: 'Advisory Group', href: `/dashboard/student/${urlUserId}/group` },
    { id: 'feedback', icon: <Star className="h-5 w-5" />, label: 'Feedback', href: `/dashboard/student/${urlUserId}/feedback` },
    { id: 'notifications', icon: <Bell className="h-5 w-5" />, label: 'Notifications', href: `/dashboard/student/${urlUserId}/notifications`, badge: unreadCount },
  ];

  // Identity comes from the server (page.tsx already ran the role and URL-id
  // guards), so there is nothing to load here.
  const currentUser: CurrentUser | null = initialUser;
  const loading = false;

  // Refresh the unread notification count (re-reads on demand so the
  // sidebar badge clears once notifications are read elsewhere).
  const refreshUnreadCount = useCallback(async () => {
    if (urlUserId !== currentUser?.id) return;
    const nr = await getMyNotifications();
    if (nr.success) {
      setUnreadCount(nr.data.filter((n) => !n.readAt).length);
    }
  }, [urlUserId, currentUser?.id]);

  // Re-sync the badge when the window regains focus (e.g. the student
  // navigates to the Notifications page, reads items, then comes back).
  useEffect(() => {
    function onFocus() { void refreshUnreadCount(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshUnreadCount]);

  // Also refresh the badge whenever this page becomes the active route again
  // via client-side navigation. The FIRST run is skipped: init() already
  // returned a fresh unread count, and firing a second getMyNotifications()
  // here cost a whole extra round trip on every single visit to the dashboard.
  const badgeSyncedRef = useRef(false);
  useEffect(() => {
    const isDashboard = pathname === `/dashboard/student/${urlUserId}`;
    if (!isDashboard) return;
    if (!badgeSyncedRef.current) {
      badgeSyncedRef.current = true;
      return;
    }
    const t = setTimeout(() => { void refreshUnreadCount(); }, 0);
    return () => clearTimeout(t);
  }, [pathname, urlUserId, refreshUnreadCount]);

  // Refresh instantly when any surface marks notifications read (the bell, the
  // notifications page, "Mark all as read", etc.) so the badge decrements the
  // moment the user acts — no need to wait for route change/focus.
  useEffect(() => {
    function onRead() { void refreshUnreadCount(); }
    window.addEventListener('aithink-notifications-read', onRead);
    return () => window.removeEventListener('aithink-notifications-read', onRead);
  }, [refreshUnreadCount]);

  // ── Groups state ────────────────────────────────────────────────────
  const [hasGroup, setHasGroup] = useState<boolean | null>(initialHasGroup);
  const checkingGroup = false;

  // ── Join dialog state ────────────────────────────────────────────────
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ── One-time join dialog ─────────────────────────────────────────────
  // Identity/role/URL-id checks and the group-membership lookup now happen on
  // the SERVER (see page.tsx) before this component renders, so the only thing
  // left to do here is the browser-local "have they seen this dialog" check.
  useEffect(() => {
    if (!initialHasGroup && !window.localStorage.getItem('aithink_join_group_seen')) {
      // The flag lives in localStorage, which the server cannot read, so this
      // has to be decided after mount — there is no hydration-safe alternative.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowJoinDialog(true);
    }
  }, [initialHasGroup]);

  // ── Close menus ──────────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────
  async function handleLogout() {
    setSigningOut(true);
    const supabase = await import('@/server/supabase/client').then((m) =>
      m.createClient()
    );
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
      setSigningOut(false);
      return;
    }
    router.replace('/login');
  }

  async function handleJoinGroup(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);

    const code = joinCode.trim();
    if (!code) {
      setJoinError('Please enter a join code.');
      return;
    }

    setJoining(true);
    const result = await joinGroupByCode(code);
    setJoining(false);

    if (result.success) {
      window.localStorage.setItem('aithink_join_group_seen', '1');
      toast.success(result.message, {
        description: `You've joined "${result.groupName}"`,
      });
      setShowJoinDialog(false);
      setHasGroup(true);
      setJoinCode('');
      // Navigate straight to the Advisory Group page so the joined group
      // reflects immediately (no reload needed).
      router.push(`/dashboard/student/${urlUserId}/group`);
    } else {
      setJoinError(result.error);
    }
  }

  function handleDismissDialog() {
    window.localStorage.setItem('aithink_join_group_seen', '1');
    setShowJoinDialog(false);
  }

  // ── Derived values ───────────────────────────────────────────────────
  const firstName = currentUser?.firstName || '';
  const lastName = currentUser?.lastName || '';
  const middleInitial = currentUser?.middleInitial || '';
  const suffix = currentUser?.suffix || '';
  const srCode = currentUser?.srCode || '';
  const email = currentUser?.email || '';
  const displayName = formatName({ firstName, middleInitial, lastName, suffix });
  const greeting = firstName || 'Student';
  const userInitials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S';

  // ── Loading screen ───────────────────────────────────────────────────
  if (loading || checkingGroup) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Sidebar toggle (desktop) */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Logo — AIThink wordmark (avatar/initials live in the user menu top-right) */}
        <button
          onClick={() => router.push(`/dashboard/student/${urlUserId}`)}
          className="flex items-center gap-2 cursor-pointer"
          title="AIThink"
        >
          <span className="text-lg font-semibold text-[#333]">AIThink</span>
        </button>

        <div className="hidden sm:block flex-1" />

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8B1A1A] text-white text-sm font-semibold hover:bg-[#a32020] transition-colors overflow-hidden"
            title={displayName || 'User'}
          >
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              userInitials
            )}
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 rounded-lg border bg-white shadow-lg z-50">
              {/* Clicking your info navigates to the profile page */}
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push(`/dashboard/student/${urlUserId}/profile`);
                }}
                className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors cursor-pointer"
                title="View profile"
              >
                <p className="text-sm font-medium text-[#333] truncate">
                  {displayName || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">{email}</p>
              </button>
              <div className="py-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push(`/dashboard/student/${urlUserId}/profile`);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <User className="h-4 w-4" />
                  My Profile
                </button>
                <button
                  onClick={handleLogout}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  {signingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* ── Desktop sidebar ─────────────────────────────────────── */}
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? 'w-56' : 'w-16'
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                prefetch
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  item.id === 'dashboard'
                    ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                } ${sidebarExpanded ? '' : 'justify-center'} cursor-pointer`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span>{item.label}</span>}
                {item.badge ? (
                  <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ${sidebarExpanded ? '' : 'absolute right-1.5 top-1.5'}`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          {/* Recents section — only visible when sidebar is expanded */}
          {sidebarExpanded && (
            <div className="flex-1 min-h-0 overflow-hidden border-t border-gray-100 mt-2 pt-1">
              <RecentTafs userId={urlUserId} initialEntries={initialRecents} />
            </div>
          )}
        </aside>

        {/* ── Mobile overlay drawer ────────────────────────────────── */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-56 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    prefetch
                    onClick={() => setMobileMenuOpen(false)}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      item.id === 'dashboard'
                        ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {/* Welcome banner */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
                Welcome back, {greeting}!
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Submit and track your Topic Abstract Forms here.
              </p>
            </div>

            {/* No-group banner */}
            {!hasGroup && (
              <Card className="mb-6 border-2 border-dashed border-amber-200 bg-amber-50/40">
                <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 shrink-0">
                      <UserCheck className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#333]">
                        You haven&apos;t joined an advisory group yet
                      </p>
                      <p className="text-xs text-gray-500">
                        Join a group to start submitting your Topic Abstract Forms.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowJoinDialog(true)}
                    className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                    size="sm"
                  >
                    Join a Group
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* User info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 shrink-0">
                    <User className="h-5 w-5 text-[#8B1A1A]" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Full Name
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base sm:text-lg font-semibold text-[#333] truncate">
                    {displayName || '—'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Email
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base sm:text-lg font-semibold text-[#333] truncate">
                    {email}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 shrink-0">
                    <BookOpen className="h-5 w-5 text-green-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    SR Code
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base sm:text-lg font-semibold text-[#333]">
                    {srCode || '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Stats dashboard (2-column) ─────────────── */}
            <StudentStatsDashboard userId={urlUserId} initialData={initialDashboardData ?? undefined} />
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────── */}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            prefetch
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              item.id === 'dashboard'
                ? 'text-[#8B1A1A]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className="relative">
            {item.icon}
            {item.badge ? (
              <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </div>
            <span className="text-[10px]">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {/* ── Join Group Dialog ──────────────────────────────────────── */}
      <Dialog
        open={showJoinDialog}
        onOpenChange={(open) => {
          if (!open) window.localStorage.setItem('aithink_join_group_seen', '1');
          setShowJoinDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-600" />
              Join an Advisory Group
            </DialogTitle>
            <DialogDescription>
              You need to join an advisory group to submit Topic Abstract Forms.
              Enter the join code given by your adviser.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleJoinGroup} className="space-y-4 pt-2">
            {joinError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {joinError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dialog-join-code">Join Code</Label>
              <Input
                id="dialog-join-code"
                placeholder="Enter join code (e.g., ABC12345)"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                disabled={joining}
                className="uppercase font-mono tracking-wider"
                maxLength={10}
                autoFocus
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDismissDialog}
                disabled={joining}
              >
                Close
              </Button>
              <Button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={joining || !joinCode.trim()}
              >
                {joining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Group'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
