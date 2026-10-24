'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type RecentTAFEntry } from '@/server/actions/recents'
import {
  leaveAdvisoryGroup,
  type StudentGroupMembership,
  type StudentGroupMember,
} from '@/server/actions/advisory-groups'
import {
  getStudentAvailableTAFs,
  submitTAFToGroup,
  getMyGroupSubmissions,
  type AvailableTAF,
  type GroupSubmission,
} from '@/server/actions/group-submissions'
import RecentTafs from '@/components/recent-tafs'
import { UserMenu } from '@/components/user-menu'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  LogOut,
  FilePlus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Users,
  Home,
  ClipboardList,
  Calendar,
  UserCheck,
  ArrowLeft,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  FileText,
  BarChart3,
  Star,
  Bell,
  User,
} from 'lucide-react'

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  revisions_needed: 'Revisions Needed',
  rejected: 'Rejected',
};

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-600 border-blue-300',
  under_review: 'bg-amber-50 text-amber-600 border-amber-300',
  approved: 'bg-green-50 text-green-600 border-green-300',
  revisions_needed: 'bg-red-50 text-red-600 border-red-300',
  rejected: 'bg-red-50 text-red-600 border-red-300',
};

const SUBMISSION_STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  under_review: <Eye className="h-3.5 w-3.5" />,
  approved: <CheckCircle className="h-3.5 w-3.5" />,
  revisions_needed: <AlertCircle className="h-3.5 w-3.5" />,
  rejected: <AlertCircle className="h-3.5 w-3.5" />,
};

type Props = {
  /** Supplied by the SERVER (see page.tsx). Everything the page renders on
   *  arrival is fetched there in parallel, so this component performs ZERO
   *  data round trips on mount — it used to fire six of them, one after
   *  another, because server actions are queued. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialGroup: StudentGroupMembership & { adviserName: string; memberCount: number };
  initialMembers: StudentGroupMember[];
  initialSubmissions: GroupSubmission[];
  /** Absent when the server fetch failed — the child then loads its own. */
  initialRecents?: RecentTAFEntry[];
};

export default function StudentGroupDetailPage({
  initialUser,
  initialUnreadCount,
  initialGroup,
  initialMembers,
  initialSubmissions,
  initialRecents,
}: Props) {
  const router = useRouter();
  const params = useParams<{ id: string; slug: string }>();
  const userId = params.id;
  const slug = params.slug;

  const unreadCount = useUnreadNotifications(userId, initialUnreadCount);

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: <Home className="h-5 w-5" />, label: 'Dashboard', href: `/dashboard/student/${userId}` },
    { id: 'taf', icon: <FilePlus className="h-5 w-5" />, label: 'Topic Abstract Form', href: `/dashboard/student/${userId}/taf` },
    { id: 'advisory-group', icon: <Users className="h-5 w-5" />, label: 'Advisory Group', href: `/dashboard/student/${userId}/group` },
    { id: 'feedback', icon: <Star className="h-5 w-5" />, label: 'Feedback', href: `/dashboard/student/${userId}/feedback` },
    { id: 'notifications', icon: <Bell className="h-5 w-5" />, label: 'Notifications', href: `/dashboard/student/${userId}/notifications`, badge: unreadCount },
  ];

  const currentUser: CurrentUser | null = initialUser;
  const loading = false;
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Group state — fetched server-side and handed down.
  const [group] = useState<(StudentGroupMembership & { adviserName: string; memberCount: number }) | null>(initialGroup);
  const groupLoading = false;

  // Members roster (other students in this group)
  const [members] = useState<StudentGroupMember[]>(initialMembers);
  const membersLoading = false;

  // Submissions state
  const [submissions, setSubmissions] = useState<GroupSubmission[]>(initialSubmissions);
  const submissionsLoading = false;

  // Submit dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [availableTAFs, setAvailableTAFs] = useState<AvailableTAF[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [selectedTafId, setSelectedTafId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // View submission routing
  function handleViewSubmission(sub: GroupSubmission) {
    router.push(`/dashboard/student/${userId}/group/${slug}/submission/${sub.id}`);
  }

  // ── Auth + group + roster: all resolved on the SERVER ─────────
  // (see page.tsx) — the role/URL-id guards, the group-by-slug lookup, the
  // member roster and the submissions list all arrive with the first render,
  // so there is nothing left to fetch here.

  // ── Close mobile menu on resize ─────────────────────────────────
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function goBack() {
    router.push(`/dashboard/student/${userId}/group`);
  }

  // ── Leave group state & handler ─────────────────────────────
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleLeaveGroup() {
    if (!group) return;
    setLeaving(true);
    const result = await leaveAdvisoryGroup(group.groupId);
    setLeaving(false);
    if (result.success) {
      toast.success('You left the advisory group.');
      setLeaveDialogOpen(false);
      // Clear the one-time join-dialog flag so a future re-join prompt works.
      window.localStorage.removeItem('aithink_join_group_seen');
      // Return to the group list (which now shows "no groups joined yet").
      router.replace(`/dashboard/student/${userId}/group`);
    } else {
      toast.error(result.error);
    }
  }

  async function handleOpenSubmitDialog() {
    setSubmitError(null);
    setSelectedTafId(null);
    setSelectedVersion(null);
    setAvailableLoading(true);
    setSubmitDialogOpen(true);

    const result = await getStudentAvailableTAFs(group?.groupId);
    setAvailableLoading(false);

    if (result.success) {
      setAvailableTAFs(result.data);
    } else {
      toast.error(result.error || 'Failed to load available TAFs.');
    }
  }

  // When a TAF is selected, auto-select the first eligible version
  function handleTafSelect(tafId: string) {
    setSelectedTafId(tafId);
    setSelectedVersion(null);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!selectedTafId || !selectedVersion || !group) {
      setSubmitError('Please select a TAF and version.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const result = await submitTAFToGroup(
      group.groupId,
      selectedTafId,
      parseInt(selectedVersion),
    );

    if (result.success) {
      toast.success(result.message);
      setSubmitDialogOpen(false);
      // Refresh submissions
      const subResult = await getMyGroupSubmissions(group.groupId);
      if (subResult.success) {
        setSubmissions(subResult.data);
      }
    } else {
      setSubmitError(result.error);
    }

    setSubmitting(false);
  }

  // ── Loading screen ──────────────────────────────────────────────
  if (loading || groupLoading) {
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

        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">
          AIThink
        </h1>

        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/student" />
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
              <RecentTafs userId={userId} initialEntries={initialRecents} />
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
            {/* Breadcrumb + Submit TAF button */}
            <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
              {/* <div>
                <nav className="flex items-center gap-2 text-sm text-gray-500">
                  <button
                    onClick={goBack}
                    className="hover:text-[#8B1A1A] transition-colors cursor-pointer"
                  >
                    Advisory Group
                  </button>
                  <ChevronLeft className="h-4 w-4 text-gray-400 rotate-180" />
                  <span className="text-[#333] font-medium truncate max-w-[300px]">
                    {group?.groupName}
                  </span>
                </nav>
              </div> */}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <Button
                  onClick={handleOpenSubmitDialog}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Submit TAF
                </Button>
                <Button
                  onClick={() => setLeaveDialogOpen(true)}
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  Leave Group
                </Button>
              </div>
            </div>

            {/* Back button */}
            {/* <button
              onClick={goBack}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#8B1A1A] transition-colors mb-6 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Show Joining of advisory group
            </button> */}

            {/* Group header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
                  <Users className="h-7 w-7 text-[#8B1A1A]" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-[#333]">
                      {group?.groupName}
                    </h1>
                    {group?.joinCode && (
                      <span
                        className="inline-flex items-center gap-1 rounded-lg border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 px-2.5 py-1 text-xs font-medium text-[#8B1A1A]"
                        title="Share this code so classmates can join the group"
                      >
                        Group Code :{" "}
                        <span className="font-mono font-bold tracking-wider">
                          {group.joinCode}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Joined on {group && new Date(group.joinedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              {group?.groupDescription && (
                <p className="text-gray-600 mt-3 max-w-2xl">
                  {group.groupDescription}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                    <UserCheck className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Adviser
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-semibold text-[#333]">
                    {group?.adviserName || '—'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 shrink-0">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Members
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-[#333]">
                    {group?.memberCount ?? '—'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 shrink-0">
                    <Calendar className="h-5 w-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Joined
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-semibold text-[#333]">
                    {group && new Date(group.joinedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Two-Column Layout: Proponents | Content ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Sidebar: Group Members */}
              <div className="lg:col-span-3">
                <div className="lg:sticky lg:top-20">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-[#8B1A1A]" />
                    <h2 className="font-semibold text-[#333]">Proponents</h2>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Students in this advisory group</p>

                  <div className="space-y-2">
                    {membersLoading ? (
                      <div className="flex items-center justify-center py-8 bg-white rounded-lg border">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : members.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400 bg-white rounded-lg border">
                        <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        No other members yet
                      </div>
                    ) : (
                      members.map((m) => {
                        const initials = ((m.firstName.charAt(0) || '') + (m.lastName.charAt(0) || '')).toUpperCase();
                        const isSelf = m.studentId === currentUser?.id;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-white border hover:shadow-sm transition-shadow"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A] text-xs font-semibold shrink-0">
                              {initials || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[#333] truncate leading-tight">
                                {m.firstName} {m.middleInitial ? `${m.middleInitial.trim().endsWith('.') ? m.middleInitial.trim() : `${m.middleInitial.trim()}.`} ` : ''}{m.lastName}
                                {isSelf && <span className="text-xs text-gray-400"> (you)</span>}
                              </p>
                              <p className="text-xs text-gray-400 leading-tight">
                                {m.srCode || '—'} • Joined {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right column: Submitted TAFs */}
              <div className="lg:col-span-9">

            {/* Submitted TAFs Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-[#333] flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#8B1A1A]" />
                  Submitted Topic Abstract Forms
                </CardTitle>
                <CardDescription>
                  TAFs you have submitted to this advisory group
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#8B1A1A]" />
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mb-4">
                      <ClipboardList className="h-7 w-7 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 mb-2">
                      No TAFs submitted yet
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenSubmitDialog}
                      className="gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Submit your first TAF
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="p-3.5 bg-white rounded-lg border hover:shadow-sm transition-shadow cursor-pointer"
                        onClick={() => handleViewSubmission(sub)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-[#333]">
                              {sub.tafSnapshot.proposedTitle || 'Untitled'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {sub.submittedBy === currentUser?.id
                                ? 'Submitted by you'
                                : `Submitted by ${sub.studentName || 'another student'}`}{' • '}
                              {new Date(sub.submittedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              V{sub.analysisVersion} • Similarity: {sub.combinedScore}%
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${
                              SUBMISSION_STATUS_COLORS[sub.status] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {SUBMISSION_STATUS_ICONS[sub.status]}
                            {SUBMISSION_STATUS_LABELS[sub.status] || sub.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
              </div>{/* /right column */}
            </div>{/* /two-column grid */}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────── */}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.href)}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              item.id === 'advisory-group'
                ? 'text-[#8B1A1A]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.icon}
            {item.badge ? (
              <span className="absolute -top-0.5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            ) : null}
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SUBMIT TAF DIALOG */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-600" />
              Submit TAF to {group?.groupName}
            </DialogTitle>
            <DialogDescription>
              Select a TAF and analysis version to submit. Only TAFs analyzed with a similarity score ≤ 24% are eligible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {submitError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            {availableLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#8B1A1A]" />
              </div>
            ) : availableTAFs.length === 0 ? (
              <div className="text-center py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-[#333] mb-1">No eligible TAFs found</p>
                <p className="text-xs text-gray-500">
                  You need to create and analyze a TAF first (similarity score must be ≤ 24%).
                </p>
              </div>
            ) : (
              <>
                {/* TAF Select */}
                <div className="space-y-2">
                  <Label htmlFor="taf-select">Select TAF</Label>
                  <Select
                    value={selectedTafId || ''}
                    onValueChange={handleTafSelect}
                  >
                    <SelectTrigger id="taf-select">
                      <SelectValue placeholder="Choose a TAF..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTAFs.map((taf) => (
                        <SelectItem key={taf.tafId} value={taf.tafId}>
                          <span className="truncate max-w-[300px] inline-block">
                            {taf.proposedTitle || 'Untitled'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Version Select (only shown when TAF is selected) */}
                {selectedTafId && (
                  <div className="space-y-2">
                    <Label htmlFor="version-select">Select Analysis Version</Label>
                    <Select
                      value={selectedVersion || ''}
                      onValueChange={(v) => {
                        setSelectedVersion(v);
                        setSubmitError(null);
                      }}
                    >
                      <SelectTrigger id="version-select">
                        <SelectValue placeholder="Choose a version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTAFs
                          .find((t) => t.tafId === selectedTafId)
                          ?.eligibleVersions.map((ver) => (
                            <SelectItem key={ver.versionNumber} value={String(ver.versionNumber)}>
                              V{ver.versionNumber} — {ver.combinedScore}% similarity —{' '}
                              {new Date(ver.analyzedAt).toLocaleDateString()}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {selectedVersion && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        This version passes the similarity threshold.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedTafId || !selectedVersion || submitting || availableTAFs.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" />
                  Submit to Group
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Group confirmation dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-red-600" />
              Leave this group?
            </DialogTitle>
            <DialogDescription>
              You&apos;ll stop being a member of <span className="font-medium text-[#333]">{group?.groupName}</span>.
              Your submitted TAFs will remain with the group (the adviser and approvers can still review them), but you will no longer be able to view or open them from this account. You can join any group again later with a valid join code.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeaveDialogOpen(false)}
              disabled={leaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLeaveGroup}
              disabled={leaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {leaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Leaving...
                </>
              ) : (
                'Yes, leave this group'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* VIEW SUBMISSION DIALOG — removed; now routes to /submission/[id] */}
      {/* ════════════════════════════════════════════════════════════════ */}
    </div>
  );
}
