'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams, usePathname } from 'next/navigation'
import { logout, type CurrentUser } from '@/server/actions/auth'
import { type StudentDashboardData } from '@/server/actions/student-dashboard'
import { type RecentTAFEntry } from '@/server/actions/recents'
import { formatName } from '@/lib/constants'
import { joinGroupByCode } from '@/server/actions/advisory-groups'
import { getMyNotifications } from '@/server/actions/approval-workflow'
import { Button } from '@/components/ui/button'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
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
import NotificationBell from '@/components/notification-bell'
import RecentTafs from '@/components/recent-tafs'
import StudentStatsDashboard from '@/components/student-stats-dashboard'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  LogOut,
  User,
  Mail,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  BookOpen,
  UserCheck,
} from 'lucide-react'
type StudentNavItem = NavItem & { href: string; badge?: number };

type Props = {
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialHasGroup: boolean;

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
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const navItems: StudentNavItem[] = navItemsFor({ role: 'student', userId: urlUserId }).map(
    (item): StudentNavItem => ({
      ...item,
      href: item.href ?? '',
      badge: item.id === 'notifications' ? unreadCount : undefined,
    }),
  );
  const currentUser: CurrentUser | null = initialUser;
  const loading = false;
  const refreshUnreadCount = useCallback(async () => {
    if (urlUserId !== currentUser?.id) return;
    const nr = await getMyNotifications();
    if (nr.success) {
      setUnreadCount(nr.data.filter((n) => !n.readAt).length);
    }
  }, [urlUserId, currentUser?.id]);
  useEffect(() => {
    function onFocus() { void refreshUnreadCount(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshUnreadCount]);
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
  useEffect(() => {
    function onRead() { void refreshUnreadCount(); }
    window.addEventListener('aithink-notifications-read', onRead);
    return () => window.removeEventListener('aithink-notifications-read', onRead);
  }, [refreshUnreadCount]);
  const [hasGroup, setHasGroup] = useState<boolean | null>(initialHasGroup);
  const checkingGroup = false;
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!initialHasGroup && !window.localStorage.getItem('aithink_join_group_seen')) {
      setShowJoinDialog(true);
    }
  }, [initialHasGroup]);
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
  async function handleLogout() {
    setSigningOut(true);
    const result = await logout();
    if (!result.success) {
      console.error('Logout error:', result.error);

      const supabase = await import('@/server/supabase/client').then((m) =>
        m.createClient()
      );
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error.message);
        setSigningOut(false);
        return;
      }
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
      router.push(`/dashboard/student/${urlUserId}/group`);
    } else {
      setJoinError(result.error);
    }
  }

  function handleDismissDialog() {
    window.localStorage.setItem('aithink_join_group_seen', '1');
    setShowJoinDialog(false);
  }
  const firstName = currentUser?.firstName || '';
  const lastName = currentUser?.lastName || '';
  const middleInitial = currentUser?.middleInitial || '';
  const suffix = currentUser?.suffix || '';
  const srCode = currentUser?.srCode || '';
  const email = currentUser?.email || '';
  const displayName = formatName({ firstName, middleInitial, lastName, suffix });
  const greeting = firstName || 'Student';
  const userInitials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S';
  if (loading || checkingGroup) {
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
        {}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {}
        <button
          onClick={() => router.push(`/dashboard/student/${urlUserId}`)}
          className="flex items-center gap-2 cursor-pointer"
          title="AIThink"
        >
          <span className="text-lg font-semibold text-[#333]">AIThink</span>
        </button>

        {
}
        <div className="flex-1" />

        {
}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`/dashboard/student/${urlUserId}/notifications`}
          hrefFor={(n) =>
            n.submissionId
              ? `/dashboard/student/${urlUserId}/taf`
              : `/dashboard/student/${urlUserId}/notifications`
          }
        />

        {}
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
              {}
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
        {}
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside
          className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${
            sidebarExpanded ? 'w-64' : 'w-16'
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
          {}
          {sidebarExpanded && (
            <div className="flex-1 min-h-0 overflow-hidden border-t border-gray-100 mt-2 pt-1">
              <RecentTafs userId={urlUserId} initialEntries={initialRecents} />
            </div>
          )}
        </aside>
          <SidebarCollapseHandle
            expanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>

        {}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-14 bottom-0 z-40 w-64 overflow-y-auto bg-white shadow-xl">
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

        {}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
                Welcome back, {greeting}!
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Submit and track your Topic Abstract Forms here.
              </p>
            </div>

            {}
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

            {}
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

            {}
            <StudentStatsDashboard userId={urlUserId} initialData={initialDashboardData ?? undefined} />
          </div>
        </main>
      </div>
      {}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {}
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