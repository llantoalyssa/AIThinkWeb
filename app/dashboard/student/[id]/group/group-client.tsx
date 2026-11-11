'use client'

// ============================================================
// Student group LIST (client) — the join-code form for a student
// who hasn't joined anything yet, plus the joined-group cards.
//
// This is only ever rendered when the student has NO joined group:
// app/dashboard/student/[id]/group/page.tsx is now a SERVER component
// that redirects straight into the group when one exists, so the old
// "flash the list, then fetch and redirect" spinner is gone.
// ============================================================

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from '@/server/actions/auth'
import { getStudentJoinedGroups, joinGroupByCode, type StudentGroupMembership } from '@/server/actions/advisory-groups'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import RecentTafs from '@/components/recent-tafs'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import StudentNotificationsBell from '@/components/student-notifications-bell'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  UserCheck,
} from 'lucide-react'

/** Student nav items come from the ONE shared source (components/nav-items.tsx).
 *  Two things stay caller-side by design: the unread NOTIFICATIONS badge
 *  (wiring keyed on item.id) and the href, which studentItems() always sets. */
type StudentNavItem = NavItem & { href: string; badge?: number };

// Helper to convert name to URL slug
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function StudentGroupListPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const unreadCount = useUnreadNotifications(userId);

  // The student's five items come from the ONE shared source.
  const navItems: StudentNavItem[] = navItemsFor({ role: 'student', userId }).map(
    (item): StudentNavItem => ({
      ...item,
      href: item.href ?? '',
      badge: item.id === 'notifications' ? unreadCount : undefined,
    }),
  );

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Advisory group state
  const [joinedGroups, setJoinedGroups] = useState<StudentGroupMembership[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  // True while we auto-redirect to the student's joined group (membership is
  // 1-to-1, so the list of groups is never shown once they've joined).
  const [redirecting, setRedirecting] = useState(false);

  // Join code form
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // ── Auth ────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchUser() {
      const result = await getCurrentUser();
      if (!result) {
        router.replace('/login');
        return;
      }
      if (result.role !== 'student') {
        router.replace(`/dashboard/${result.role}/${result.id}`);
        return;
      }
      if (userId !== result.id) {
        router.replace(`/dashboard/student/${result.id}/group`);
        return;
      }
      setCurrentUser(result);
      setLoading(false);
    }
    fetchUser();
  }, [router, userId]);

  // ── Fetch joined groups ─────────────────────────────────────────
  // Membership is 1-to-1 (one advisory group per student), so as soon as we
  // know the student is already in a group we skip the list entirely and go
  // straight to that group's page. The list of cards is only ever a
  // fallback for a student who hasn't joined yet.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function load() {
      setGroupsLoading(true);
      const result = await getStudentJoinedGroups();
      if (cancelled) return;
      if (result.success) {
        setJoinedGroups(result.data);
        if (result.data.length > 0) {
          setRedirecting(true);
          router.replace(
            `/dashboard/student/${userId}/group/${slugify(result.data[0].groupName)}`,
          );
          return;
        }
      }
      setGroupsLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [loading, router, userId]);

  // ── Close mobile menu on resize ─────────────────────────────────
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      toast.success(result.message, {
        description: `You've joined "${result.groupName}"`,
      });
      setJoinCode('');
      // Membership is 1-to-1 — go straight into the joined group instead of
      // refreshing a card list that we no longer show.
      setRedirecting(true);
      router.replace(
        `/dashboard/student/${userId}/group/${slugify(result.groupName)}`,
      );
    } else {
      setJoinError(result.error);
    }
  }

  // ── Loading / redirecting screen ────────────────────────────────
  if (loading || redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">
          AIThink
        </h1>

        {/* One bell on every student page — the header was inconsistent: it
            appeared on the dashboard/TAF/profile only. */}
        <StudentNotificationsBell userId={userId} />
        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/student" />
      </header>

      <div className="flex flex-1 relative">
        {/* ── Desktop sidebar ─────────────────────────────────────── */}
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside
          className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${
            sidebarExpanded ? 'w-64' : 'w-16'
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  item.id === 'advisory-group'
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
              </button>
            ))}
          </nav>
          {sidebarExpanded && (
            <div className="flex-1 min-h-0 overflow-hidden border-t border-gray-100 mt-2 pt-1">
              <RecentTafs userId={userId} />
            </div>
          )}
        </aside>
          <SidebarCollapseHandle
            expanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>

        {/* ── Mobile overlay drawer ────────────────────────────────── */}
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
                      router.push(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      item.id === 'advisory-group'
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
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
              <span className="text-[#333] font-medium">Advisory Group</span>
            </nav>

            {/* ── Join Code Section ─────────────────────────────────────
                Only ever rendered for a student who has NOT joined a group.
                Once they join we navigate straight into the group, so there
                is no card list to show here. */}
            {!groupsLoading && joinedGroups.length === 0 && (
              <Card className="mb-8 border-2 border-dashed border-amber-200 bg-amber-50/30">
                <CardHeader>
                  <CardTitle className="text-lg text-[#333] flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-amber-600" />
                    Join an Advisory Group
                  </CardTitle>
                  <CardDescription>
                    Enter the join code given by your adviser to join their advisory group.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleJoinGroup} className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Label htmlFor="join-code" className="sr-only">Join Code</Label>
                      <Input
                        id="join-code"
                        placeholder="Enter join code (e.g., ABC12345)"
                        value={joinCode}
                        onChange={(e) => {
                          setJoinCode(e.target.value.toUpperCase());
                          setJoinError(null);
                        }}
                        disabled={joining}
                        className="uppercase font-mono tracking-wider bg-white"
                        maxLength={10}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white shrink-0"
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
                  </form>
                  {joinError && (
                    <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {joinError}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* While we check membership, show a spinner. Once a joined group
                is found we redirect INTO it (see the load effect) — the card
                list is gone. A student with no group just sees the join card
                above. */}
            {groupsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#8B1A1A]" />
              </div>
            )}
          </div>
        </main>
      </div>


      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  );
}
