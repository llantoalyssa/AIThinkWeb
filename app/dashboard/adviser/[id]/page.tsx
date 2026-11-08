'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getAdviserDashboardData } from '@/server/actions/adviser-shell'
import { UserMenu } from '@/components/user-menu'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import NotificationBell from '@/components/notification-bell'
import {
  getMyNotifications,
  type ApprovalListItem,
} from '@/server/actions/approval-workflow'
import { 
  createAdvisoryGroup,
  updateAdvisoryGroup,
  deleteAdvisoryGroup,
  type AdvisoryGroup 
} from '@/server/actions/advisory-groups'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  Users,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  FolderOpen,
  MoreVertical,
  FileText,
  Archive,
  RotateCcw,
  Search,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'

// Helper to convert name to URL slug
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function AdviserDashboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const urlUserId = params.id;

  // The adviser's two items come from the ONE shared source
  // (components/nav-items.tsx) — no local copy here any more. This page IS the
  // Dashboard destination, so that item keeps its highlight: `active` is the
  // CALLER's contract, and nav-items deliberately leaves it unset. The
  // Notifications item now carries its own href, so the click no longer needs a
  // label special-case to reach the notifications page.
  // The account's effective permission keys — arrive with the dashboard bundle
  // below. Undefined = not resolved yet, which renders the adviser's default two
  // items (permissive) rather than an empty nav for a beat.
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);

  const navItems: NavItem[] = navItemsFor({
    role: "adviser",
    userId: urlUserId,
    permissions,
  }).map(
    (item): NavItem => (item.id === "dashboard" ? { ...item, active: true } : item),
  );

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [advisoryGroups, setAdvisoryGroups] = useState<AdvisoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  // Joined-student count per group id, shown on each group card.
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  // Pending-TAF count per group id, shown as each card's badge.
  const [pendingByGroup, setPendingByGroup] = useState<Record<string, number>>({});
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Notifications (assigned approvals routed to this adviser) — feeds the
  // "Pending TAFs" dashboard card. The header bell is the shared NotificationBell.
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalListItem[]>([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);

  // Unread NOTIFICATION count — the SINGLE source for BOTH the sidebar
  // "Notifications" badge and the header bell, kept in sync via the shared
  // 'aithink-notifications-read' event. (Pending approvals are a different
  // concept and only drive the Pending TAFs card, not the badge.)
  const [unreadCount, setUnreadCount] = useState(0);

  // Create group dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Active/Archived filter — default shows ACTIVE groups.
  const [groupFilter, setGroupFilter] = useState<'active' | 'archived'>('active');
  // Search + creation-year, applied to whichever tab is open.
  const [groupQuery, setGroupQuery] = useState('');
  const [groupYear, setGroupYear] = useState('all');
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // ONE round trip. This used to be getCurrentUser() followed by four more
      // server actions — and because server actions are QUEUED, that cost five
      // sequential browser round trips before the dashboard appeared. The
      // bundle resolves identity, unread count, groups, student total and
      // pending approvals in parallel, server-side.
      const data = await getAdviserDashboardData();
      if (!data.success) {
        router.replace('/login');
        return;
      }
      const userResult = data.user;
      if (userResult.role !== 'adviser') {
        router.replace(`/dashboard/${userResult.role}/${userResult.id}`);
        return;
      }
      // Granted pages become nav items (Research Analytics / Approved TAF /
      // Journals / Audit Trail) — set BEFORE the loading flag drops so the nav
      // is complete on the first painted frame.
      setPermissions(data.permissions ?? []);
      // Validate URL user ID matches current user
      if (urlUserId !== userResult.id) {
        router.replace(`/dashboard/${userResult.role}/${userResult.id}`);
        return;
      }
      setCurrentUser(userResult);

      setAdvisoryGroups(data.groups);
      setTotalStudents(data.totalStudents);
      setMemberCounts(data.memberCounts);
      setPendingByGroup(data.pendingByGroup);
      setPendingApprovals(data.pendingApprovals);
      setPendingLoaded(true);
      setUnreadCount(data.unreadCount);

      setLoading(false);
    }
    fetchData();
  }, [router, urlUserId]);

  // Keep the sidebar badge in sync with the header bell: both react to the
  // shared 'aithink-notifications-read' event (fired when anything marks
  // notifications read) and re-resolve the same unread count.
  //
  // No call on mount: the bundle above already returned a fresh unread count,
  // so re-fetching here would add a second queued round trip for a value we
  // already have. (Only the event/focus paths re-resolve it.)
  useEffect(() => {
    async function refreshUnread() {
      const nr = await getMyNotifications();
      if (nr.success) setUnreadCount(nr.data.filter((n) => !n.readAt).length);
    }
    function onRead() { void refreshUnread(); }
    function onFocus() { void refreshUnread(); }
    window.addEventListener('aithink-notifications-read', onRead);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('aithink-notifications-read', onRead);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Close mobile menu when window resizes to desktop
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    setCreatingGroup(true);

    const result = await createAdvisoryGroup({
      name: newGroupName,
      description: newGroupDescription,
    });

    if (result.success) {
      setAdvisoryGroups([result.data, ...advisoryGroups]);
      setNewGroupName('');
      setNewGroupDescription('');
      setCreateDialogOpen(false);
    } else {
      setCreateError(result.error);
    }

    setCreatingGroup(false);
  }

  // Radix's DropdownMenu and Dialog both lock the page by setting
  // `pointer-events: none` on <body>. Opening the delete dialog directly from
  // a dropdown item makes their cleanup race, and the leaked inline style
  // leaves the WHOLE page unclickable (that's why a card stopped responding
  // after Delete → Cancel). Clear the leaked style whenever the delete dialog
  // closes, and after a delete finishes.
  function clearBodyPointerEvents() {
    if (typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      document.body.style.pointerEvents = "";
    });
  }

  function closeDeleteDialog() {
    setDeletingGroupId(null);
    clearBodyPointerEvents();
  }

  async function handleDeleteGroup(groupId: string) {
    setDeleting(true);
    const result = await deleteAdvisoryGroup(groupId);
    
    if (result.success) {
      setAdvisoryGroups(advisoryGroups.filter(g => g.id !== groupId));
      toast.success('Advisory group deleted.');
    } else {
      toast.error(result.error);
    }
    
    setDeleting(false);
    setDeletingGroupId(null);
    clearBodyPointerEvents();
  }

  // Archive (set inactive) / restore a group. No membership check — an adviser
  // can archive a group even if students are still joined (it just becomes
  // inactive / hidden from the active list, and students can't join it via code).
  async function handleArchiveToggle(group: AdvisoryGroup) {
    setArchivingId(group.id);
    const result = await updateAdvisoryGroup({ id: group.id, isActive: !group.isActive });
    setArchivingId(null);

    if (result.success) {
      const updated = result.data;
      setAdvisoryGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      toast.success(updated.isActive ? 'Advisory group restored.' : 'Advisory group archived.');
    } else {
      toast.error(result.error);
    }
  }

  function navigateToGroup(group: AdvisoryGroup) {
    const groupSlug = slugify(group.name);
    router.push(`/dashboard/adviser/${urlUserId}/group/${groupSlug}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  const firstName = currentUser?.firstName || '';
  const lastName = currentUser?.lastName || '';
  const greeting = firstName || 'Adviser';

  // Groups filtered by the Active/Archived toggle.
  /** Creation year of a group, in Philippine time ("" when unknown). */
  const groupYearOf = (createdAt: string | null | undefined): string => {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return String(
      new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getFullYear(),
    );
  };

  const tabGroups = advisoryGroups.filter((g) =>
    groupFilter === 'active' ? g.isActive : !g.isActive
  );

  const groupYears = Array.from(
    new Set(tabGroups.map((g) => groupYearOf(g.createdAt)).filter(Boolean)),
  ).sort((a, b) => Number(b) - Number(a));

  const visibleGroups = tabGroups.filter((g) => {
    if (groupYear !== 'all' && groupYearOf(g.createdAt) !== groupYear) return false;
    const q = groupQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* ── Top header bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>


        {/* Title */}
        <h1 className="text-lg font-semibold text-[#333] flex-1">
          AIThink
        </h1>

        {/* Notifications bell → the user's notifications (unread badge that
            decrements as items are viewed, max 5 shown) */}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`/dashboard/adviser/${urlUserId}/notifications`}
          hrefFor={(n) => {
            if (n.submissionId && n.groupName) {
              return `/dashboard/adviser/${urlUserId}/group/${slugify(n.groupName)}/submission/${n.submissionId}`;
            }
            if (n.groupName) {
              return `/dashboard/adviser/${urlUserId}/group/${slugify(n.groupName)}`;
            }
            return null;
          }}
        />

        {/* User menu (top-right) */}
        <UserMenu user={currentUser} userId={urlUserId} routeBase="/dashboard/adviser" />
      </header>

      <div className="flex flex-1 relative">
        {/* ── Desktop sidebar ───────────────────────────────────────────────────────────────── */}
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside
          className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${
            sidebarExpanded ? 'w-64' : 'w-16'
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => {
              // "Notifications" opens the full notifications page — its href now
              // comes from the shared source, so the click needs no special-case.
              // Badge = the same unread count as the header bell (kept in sync
              // via the shared event).
              const isNotif = item.id === 'notifications';
              const count = isNotif ? unreadCount : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.href) router.push(item.href);
                  }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isNotif
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : item.active
                        ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  } ${sidebarExpanded ? '' : 'justify-center'} cursor-pointer`}
                  title={item.label}
                >
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
          <SidebarCollapseHandle
            expanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>

        {/* ── Mobile overlay drawer ───────────────────────────────────────────────────────────── */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <aside className="absolute left-0 top-14 bottom-0 z-40 w-64 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => {
                  const isNotif = item.id === 'notifications';
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.href) router.push(item.href);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        item.active
                          ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      } cursor-pointer`}
                    >
                      <span className="relative">
                        {item.icon}
                        {isNotif && unreadCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* ── Main content ──────────────────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {/* Welcome banner */}
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
                  Welcome back, {greeting}!
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Manage your advisory groups and track student progress.
                </p>
              </div>
              
              {/* Create Group Button — ACTIVE tab only. You can't create an
                  archived group (archiving is an action on an existing group),
                  so the trigger is hidden on the Archived tab where it was
                  misleading. */}
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                {groupFilter === 'active' && (
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Group
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Advisory Group</DialogTitle>
                    <DialogDescription>
                      Create a new group for your advisees. You can add students to this group later.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateGroup} className="space-y-4 pt-4">
                    {createError && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {createError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="group-name">Group Name *</Label>
                      <Input
                        id="group-name"
                        placeholder="e.g., Capstone Group A"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        disabled={creatingGroup}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="group-description">
                        Description{" "}
                        <span className="text-gray-400">(optional)</span>
                      </Label>
                      <Textarea
                        id="group-description"
                        placeholder="Short description of this advisory group... (optional)"
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                        disabled={creatingGroup}
                        rows={2}
                        maxLength={200}
                      />
                      <p className="text-right text-[11px] text-gray-400">
                        {newGroupDescription.length}/200
                      </p>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={creatingGroup}>
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button 
                        type="submit" 
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={
                          creatingGroup ||
                          newGroupName.trim().length < 3
                        }
                      >
                        {creatingGroup ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Group'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 shrink-0">
                    <FolderOpen className="h-5 w-5 text-[#8B1A1A]" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Total Groups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-[#333]">
                    {advisoryGroups.length}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Total Students
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-[#333]">
                    {totalStudents === null ? '—' : totalStudents}
                  </p>
                </CardContent>
              </Card>

              {/* Clickable: the count alone forced an adviser to open every
                  advisory group to find out WHICH TAFs were waiting. This opens
                  the flat Pending TAFs list across all of their groups. */}
              <Link
                href={`/dashboard/adviser/${urlUserId}/pending`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B1A1A]/30"
              >
                <Card className="cursor-pointer transition-colors hover:border-[#8B1A1A]/30 hover:bg-gray-50/60">
                  <CardHeader className="flex flex-row items-center gap-3 pb-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 shrink-0">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                    <CardTitle className="flex-1 text-sm font-medium text-gray-500">
                      Pending TAFs
                    </CardTitle>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-[#333]">
                      {pendingLoaded ? pendingApprovals.length : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">View all</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Advisory Groups Grid */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-[#333] flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-[#8B1A1A]" />
                  My Advisory Groups
                </h2>
                {/* Active / Archived filter — default is Active */}
                <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => setGroupFilter('active')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      groupFilter === 'active'
                        ? 'bg-white text-[#8B1A1A] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setGroupFilter('archived')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      groupFilter === 'archived'
                        ? 'bg-white text-[#8B1A1A] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Archived
                  </button>
                </div>
              </div>

              {/* Search + creation year, applied to whichever tab is open. */}
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={groupQuery}
                    onChange={(e) => setGroupQuery(e.target.value)}
                    placeholder="Search group name or description..."
                    className="pl-9"
                  />
                </div>
                <select
                  value={groupYear}
                  onChange={(e) => setGroupYear(e.target.value)}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                >
                  <option value="all">All Years</option>
                  {groupYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              {visibleGroups.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
                      <FolderOpen className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-[#333] mb-2">
                      {groupQuery.trim() || groupYear !== 'all'
                        ? 'No advisory groups match your filters'
                        : groupFilter === 'active'
                          ? 'No active advisory groups'
                          : 'No archived advisory groups'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 max-w-sm">
                      {groupFilter === 'active'
                        ? 'Create your first advisory group to start managing your advisees and their capstone projects.'
                        : 'Groups you archive will appear here. Archive a group from its card menu.'}
                    </p>
                    {/* You can't CREATE an archived group — archiving is an
                        action on an existing group, so the create prompt only
                        belongs on the Active tab. */}
                    {groupFilter === 'active' && (
                      <Button
                        onClick={() => setCreateDialogOpen(true)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Group
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleGroups.map((group) => (
                    <Card 
                      key={group.id} 
                      className={`group cursor-pointer hover:shadow-md transition-shadow ${
                        group.isActive ? 'border-l-4 border-l-[#8B1A1A]' : 'border-l-4 border-l-gray-300 opacity-90'
                      }`}
                      onClick={() => navigateToGroup(group)}
                      // Warm the route on hover so the click is not a cold load.
                      onMouseEnter={() =>
                        router.prefetch(`/dashboard/adviser/${urlUserId}/group/${slugify(group.name)}`)
                      }
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base font-semibold text-[#333] line-clamp-1">
                            {group.name}
                            {/* Joined students in THIS group: count, then the
                                person icon. */}
                            <span
                              className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 align-middle"
                              title="Students who joined this group"
                            >
                              {memberCounts[group.id] ?? 0}
                              <UserRound className="h-3 w-3" />
                            </span>
                            {/* Pending TAFs in THIS group — the same badge the
                                associate dean / dean cards show. */}
                            {(pendingByGroup[group.id] ?? 0) > 0 && (
                              <span
                                className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 align-middle"
                                title="TAFs from this group awaiting a decision"
                              >
                                {pendingByGroup[group.id]}
                                <FileText className="h-3 w-3" />
                              </span>
                            )}
                            {!group.isActive && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide align-middle">
                                <Archive className="h-3 w-3" /> Archived
                              </span>
                            )}
                          </CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                                title="Group actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingGroupId(group.id);
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleArchiveToggle(group);
                                }}
                              >
                                {group.isActive ? (
                                  <>
                                    <Archive className="h-4 w-4 mr-2" />
                                    {archivingId === group.id ? 'Archiving...' : 'Archive'}
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Restore
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <CardDescription className="text-xs">
                          Created {new Date(group.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-gray-600 line-clamp-2 break-words">
                          {group.description || 'No description provided.'}
                        </p>
                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Users className="h-3.5 w-3.5" />
                            <span>Click to view group details</span>
                          </div>
                          <div 
                            className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(group.joinCode);
                            }}
                            title="Click to copy join code"
                          >
                            <span className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Code:</span>
                            <span className="text-xs font-mono font-bold text-amber-700">{group.joinCode}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>


      {/* ── Footer ────────────────────────────────────────────────────────────────────────────────── */}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingGroupId}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Advisory Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this advisory group? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={closeDeleteDialog}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deletingGroupId && handleDeleteGroup(deletingGroupId)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Group'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
