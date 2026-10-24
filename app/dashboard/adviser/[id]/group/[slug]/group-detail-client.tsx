'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { type CurrentUser } from '@/server/actions/auth'
import { UserMenu } from '@/components/user-menu'
import { createClient } from '@/server/supabase/client'
import { htmlToPlainText } from '@/lib/html'
import { formatName } from '@/lib/constants'
import AdviserApprovalBell from '@/components/adviser-approval-bell'
import ConfirmDeleteModal from '@/components/ui/confirm-delete-modal'
import {
  updateAdvisoryGroup,
  deleteAdvisoryGroup,
  getAdviserGroupStudents,
  removeStudentFromGroup,
  type AdvisoryGroup,
  type GroupStudent,
} from '@/server/actions/advisory-groups'
import {
  getGroupSubmissions,
  type GroupSubmission,
} from '@/server/actions/group-submissions'
import { getMyNotifications } from '@/server/actions/approval-workflow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart3,
  Users,
  Bell,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  FolderOpen,
  ArrowLeft,
  Edit3,
  Trash2,
  UserMinus,
  FileText,
  MoreVertical,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Send,
} from 'lucide-react'

type NavItem = {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
};

// Helper to convert name to URL slug — used for redirect after rename
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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
  /** Everything below is fetched on the SERVER (see page.tsx) and handed down,
   *  so navigating here costs ZERO data round trips — the group, its roster and
   *  its submissions ship with the RSC payload. This page used to fire five
   *  separate server actions on mount, and because server actions are queued
   *  they ran one after another (~3s before anything appeared). */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialGroup: AdvisoryGroup;
  initialStudents: GroupStudent[];
  initialSubmissions: GroupSubmission[];
};

export default function AdvisoryGroupDetailPage({
  initialUser,
  initialUnreadCount,
  initialGroup,
  initialStudents,
  initialSubmissions,
}: Props) {
  const router = useRouter();
  const params = useParams<{ id: string; slug: string }>();
  const userId = params.id;
  const slug = params.slug;

  const navItems: NavItem[] = [
    { icon: <BarChart3 className="h-5 w-5" />, label: "Dashboard", href: `/dashboard/adviser/${userId}` },
    { icon: <Bell className="h-5 w-5" />, label: "Notifications", href: `/dashboard/adviser/${userId}/notifications` },
  ];

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(initialUser);
  const [group, setGroup] = useState<AdvisoryGroup | null>(initialGroup);
  const [loading, setLoading] = useState(!initialGroup);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Unread NOTIFICATION count — same single source as the header bell, kept in
  // sync via the shared 'aithink-notifications-read' event (not pending approvals).
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  // Re-sync the unread count whenever any surface marks notifications read (the
  // bell wipes on open) or on focus. There is deliberately NO call on mount: the
  // server already handed down a fresh count, so fetching again was a second
  // queued round trip for a value we already had.
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

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(initialGroup.name);
  const [editDescription, setEditDescription] = useState(initialGroup.description || '');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Remove-student-from-group state
  const [removingStudent, setRemovingStudent] = useState<GroupStudent | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Students state
  const [students, setStudents] = useState<GroupStudent[]>(initialStudents);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState<GroupSubmission[]>(initialSubmissions);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  // The resolved group id (realtime channel key + live refetch).
  const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(initialGroup.id);
  const groupIdRef = useRef<string | null>(initialGroup.id);

  // Reusable submissions loader — used on mount AND on realtime "new
  // submission" broadcasts so a freshly submitted TAF appears instantly.
  const loadSubmissions = useCallback(async (groupId: string) => {
    setSubmissionsLoading(true);
    const submissionsResult = await getGroupSubmissions(groupId);
    if (submissionsResult.success) {
      setSubmissions(submissionsResult.data);
    }
    setSubmissionsLoading(false);
  }, []);

  // Realtime: when a student submits a TAF to this group, the row is
  // INSERTed into group_taf_submissions (added to the supabase_realtime
  // publication in migration 034). We subscribe with postgres_changes
  // filtered to this group and refetch so the new card appears instantly.
  // The adviser's SELECT RLS passes, so the subscriber receives rows.
  useEffect(() => {
    const groupId = resolvedGroupId;
    if (!groupId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`group-submissions-live-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_taf_submissions",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadSubmissions(groupId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedGroupId, loadSubmissions]);

  // View submission routing
  function handleViewSubmission(sub: GroupSubmission) {
    router.push(`/dashboard/adviser/${userId}/group/${slug}/submission/${sub.id}`);
  }

  // ── FALLBACK ONLY ─────────────────────────────────────────────────────
  // The server page (page.tsx) fetches the group, its roster and its
  // submissions and hands them down as props, so on a normal visit this effect
  // returns immediately and NO server action is fired from the browser. It is
  // kept only so the component still works if it is ever rendered without the
  // server-provided props. (Fully guarded: `if (initialGroup) return`.)
  useEffect(() => {
    if (initialGroup) return;
    async function fetchData() {
      const { getCurrentUser } = await import('@/server/actions/auth');
      const { getAdviserGroupBySlug } = await import('@/server/actions/advisory-groups');

      const userResult = await getCurrentUser();
      if (!userResult) {
        router.replace('/login');
        return;
      }
      if (userResult.role !== 'adviser') {
        router.replace(`/dashboard/${userResult.role}/${userResult.id}`);
        return;
      }
      setCurrentUser(userResult);

      // Fetch advisory group by slug
      const groupResult = await getAdviserGroupBySlug(slug);
      if (groupResult.success) {
        setGroup(groupResult.data);
        setEditName(groupResult.data.name);
        setEditDescription(groupResult.data.description || '');
        setResolvedGroupId(groupResult.data.id);
        groupIdRef.current = groupResult.data.id;

        // Fetch students + submissions in parallel (both only need the group id)
        setStudentsLoading(true);
        setSubmissionsLoading(true);
        const [studentsResult, submissionsResult] = await Promise.all([
          getAdviserGroupStudents(groupResult.data.id),
          getGroupSubmissions(groupResult.data.id),
        ]);
        if (studentsResult.success) {
          setStudents(studentsResult.data);
        }
        setStudentsLoading(false);
        if (submissionsResult.success) {
          setSubmissions(submissionsResult.data);
        }
        setSubmissionsLoading(false);
      } else {
        router.push(`/dashboard/adviser/${userResult.id}`);
        return;
      }

      setLoading(false);
    }
    fetchData();
  }, [router, slug, initialGroup]);

  // Reusable roster loader — used on mount, on realtime membership changes,
  // and right after the adviser removes a student.
  const loadStudents = useCallback(async (groupId: string) => {
    const res = await getAdviserGroupStudents(groupId);
    if (res.success) setStudents(res.data);
  }, []);

  // Realtime: keep the Proponents card in sync without a manual refresh
  // (requires migration 030 — publication + REPLICA IDENTITY FULL).
  //  - INSERT: a student joined
  //  - DELETE: a student LEFT the group, or the adviser removed them. This was
  //    missing, which is why a departed student stayed listed on the card until
  //    the page was reloaded.
  //  - UPDATE: membership row changed
  const groupIdForRealtime = group?.id;
  useEffect(() => {
    if (!groupIdForRealtime) return;
    const gid = groupIdForRealtime;
    let supabase: ReturnType<typeof import('@/server/supabase/client')['createClient']> | null = null;
    let channel: { unsubscribe: () => void } | null = null;
    async function setup() {
      const { createClient } = await import('@/server/supabase/client');
      supabase = createClient();
      const membershipFilter = { schema: 'public', table: 'student_group_memberships', filter: `group_id=eq.${gid}` };
      channel = supabase
        .channel(`adviser-group-members-${gid}`)
        .on('postgres_changes', { event: 'INSERT', ...membershipFilter }, () => {
          void loadStudents(gid);
        })
        .on('postgres_changes', { event: 'DELETE', ...membershipFilter }, () => {
          // Someone left (or was removed) — drop them from the roster.
          void loadStudents(gid);
        })
        .on('postgres_changes', { event: 'UPDATE', ...membershipFilter }, () => {
          void loadStudents(gid);
        })
        .subscribe();
    }
    void setup();
    return () => {
      channel?.unsubscribe?.();
    };
  }, [groupIdForRealtime, loadStudents]);

  // Close mobile menu when window resizes to desktop
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function handleUpdateGroup(e: React.FormEvent) {
    e.preventDefault();
    setUpdateError(null);
    setUpdating(true);

    const result = await updateAdvisoryGroup({
      id: group!.id,
      name: editName,
      description: editDescription,
    });

    if (result.success) {
      setGroup(result.data);
      setEditDialogOpen(false);
      // If the name changed, redirect to the new slug
      const newSlug = slugify(result.data.name);
      if (newSlug !== slug) {
        router.replace(`/dashboard/adviser/${userId}/group/${newSlug}`);
      }
    } else {
      setUpdateError(result.error);
    }

    setUpdating(false);
  }

  async function handleDeleteGroup() {
    if (!group) return;
    setDeleting(true);
    const result = await deleteAdvisoryGroup(group.id);

    if (!result.success) {
      setDeleting(false);
      setDeleteDialogOpen(false);
      toast.error(result.error || 'Failed to delete the advisory group.');
      return;
    }

    // Close the dialog BEFORE navigating. Radix locks the page while a dialog is
    // open (pointer-events: none + scroll lock on <body>); navigating away with
    // it still open can skip that cleanup and leave the next page frozen until a
    // manual reload. Closing first lets Radix unwind normally, and we also clear
    // any leaked lock as a safety net.
    setDeleteDialogOpen(false);
    setDeleting(false);
    document.body.style.pointerEvents = '';
    window.requestAnimationFrame(() => {
      document.body.style.pointerEvents = '';
      router.push(`/dashboard/adviser/${currentUser?.id ?? userId}`);
    });
  }

  // Remove a student from this group. Only the membership row is deleted —
  // any TAF they already submitted stays with the adviser.
  async function handleRemoveStudent() {
    if (!removingStudent || !group) return;
    setRemoveBusy(true);
    const result = await removeStudentFromGroup(group.id, removingStudent.studentId);
    setRemoveBusy(false);
    setRemovingStudent(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${result.studentName} was removed from the group.`, {
      description: 'Any TAF they already submitted stays with you.',
    });
    // Update the Proponents card immediately (realtime would also catch it).
    await loadStudents(group.id);
  }

  function goBack() {
    if (currentUser) {
      router.push(`/dashboard/adviser/${currentUser.id}`);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  // Pending count for stats
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const totalTAFs = submissions.length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {/* ── Top header bar ─────────────────────────────────────────────────────── */}
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

        {/* Notifications bell (shared, always in sync with the dashboard) */}
        <AdviserApprovalBell
          adviserId={userId}
          routerPush={(href) => router.push(href)}
          routeBase={`/dashboard/adviser/${userId}`}
        />

        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/adviser" />
      </header>

      <div className="flex flex-1 relative">
        {/* ── Desktop sidebar ───────────────────────────────────────────────────────────────── */}
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? 'w-48' : 'w-16'
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => {
              const isNotif = item.label === 'Notifications';
              const count = isNotif ? unreadCount : 0;
              return (
                <button
                  key={item.label}
                  onClick={() => item.href && router.push(item.href)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    item.active
                      ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  } ${sidebarExpanded ? '' : 'justify-center'} ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                  title={item.label}
                  disabled={!item.href}
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

        {/* ── Mobile overlay drawer ───────────────────────────────────────────────────────────── */}
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
                    key={item.label}
                    onClick={() => {
                      if (item.href) {
                        router.push(item.href);
                      }
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      item.active
                        ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    } ${!item.href ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    disabled={!item.href}
                  >
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

        {/* ── Main content ──────────────────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            
            {/* Top Bar: Back + Edit/Delete */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={goBack}
                className="gap-1 text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Groups
              </Button>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setEditDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>

            {/* ── Two-Column Layout: Proponents | Content ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Sidebar: Proponents */}
              <div className="lg:col-span-3">
                <div className="lg:sticky lg:top-20">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-[#8B1A1A]" />
                    <h2 className="font-semibold text-[#333]">Proponents</h2>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Students in this advisory group</p>
                  
                  <div className="space-y-2">
                    {studentsLoading ? (
                      <div className="flex items-center justify-center py-8 bg-white rounded-lg border">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : students.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400 bg-white rounded-lg border">
                        <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        No students yet
                      </div>
                    ) : (
                      students.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-white border hover:shadow-sm transition-shadow"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A] text-xs font-semibold shrink-0">
                            {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#333] truncate leading-tight">
                              {formatName({
                                firstName: student.firstName,
                                middleInitial: student.middleInitial,
                                lastName: student.lastName,
                                suffix: undefined,
                              }) || "Student"}
                            </p>
                            <p className="text-xs text-gray-400 leading-tight">
                              {student.srCode} • Joined {new Date(student.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                          {/* Remove this student from the group. Anything they
                              already submitted is kept. */}
                          <button
                            type="button"
                            onClick={() => setRemovingStudent(student)}
                            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title={`Remove ${student.firstName} ${student.lastName} from this group`}
                            aria-label={`Remove ${student.firstName} ${student.lastName} from this group`}
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Group Info + Stats + Submissions */}
              <div className="lg:col-span-9">
                {/* Group Header */}
                <div className="bg-white rounded-lg border p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8B1A1A]/10 shrink-0">
                      <FolderOpen className="h-5 w-5 text-[#8B1A1A]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-xl font-bold text-[#333]">{group?.name}</h1>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Created on {group && new Date(group.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {group?.description && (
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Join Code */}
                  <div className="mt-3 pt-3 border-t flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
                      <span className="text-xs text-amber-600 font-medium uppercase">Join Code:</span>
                      <span className="text-sm font-mono font-bold text-amber-700 tracking-wider">{group?.joinCode}</span>
                      <button
                        onClick={() => {
                          if (group?.joinCode) {
                            navigator.clipboard.writeText(group.joinCode);
                          }
                        }}
                        className="ml-1 text-xs text-amber-600 hover:text-amber-800 underline font-medium"
                      >
                        Copy
                      </button>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        const { regenerateJoinCode } = await import('@/server/actions/advisory-groups');
                        const result = await regenerateJoinCode(group!.id);
                        if (result.success) {
                          setGroup(prev => prev ? { ...prev, joinCode: result.newCode } : null);
                        }
                      }}
                      disabled={!group}
                      className="text-xs h-7"
                    >
                      Regenerate Code
                    </Button>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
                  <Card className="shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Users className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs text-gray-500">Students</span>
                      </div>
                      <p className="text-xl font-bold text-[#333]">
                        {studentsLoading ? '—' : students.length}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {students.length === 1 ? '1 joined' : students.length === 0 ? 'None' : `${students.length} joined`}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <FileText className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-xs text-gray-500">Submitted TAFs</span>
                      </div>
                      <p className="text-xl font-bold text-[#333]">
                        {submissionsLoading ? '—' : totalTAFs}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {totalTAFs === 0 ? 'None' : `${totalTAFs} submitted`}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Bell className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs text-gray-500">Pending Review</span>
                      </div>
                      <p className="text-xl font-bold text-[#333]">
                        {submissionsLoading ? '—' : pendingCount}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {pendingCount === 0 ? 'Nothing' : `${pendingCount} pending`}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Submitted TAFs */}
                <div>
                  <h2 className="text-sm font-semibold text-[#333] mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#8B1A1A]" />
                    Submitted Topic Abstract Forms
                  </h2>
                  
                  {submissionsLoading ? (
                    <div className="flex items-center justify-center py-12 bg-white rounded-lg border">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : submissions.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-dashed">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                        <FileText className="h-7 w-7 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500">
                        No TAFs have been submitted to this group yet.
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Students join the group and submit their analyzed TAFs here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {submissions.map((sub) => (
                        <div
                          key={sub.id}
                          className="p-3.5 bg-white rounded-lg border-l-4 border-l-[#8B1A1A] shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleViewSubmission(sub)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-sm font-semibold text-[#333]">
                                  {sub.tafSnapshot.proposedTitle || 'Untitled'}
                                </h3>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
                                    SUBMISSION_STATUS_COLORS[sub.status] || 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {SUBMISSION_STATUS_ICONS[sub.status]}
                                  {SUBMISSION_STATUS_LABELS[sub.status] || sub.status}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Submitted by <span className="font-medium text-[#333]">{sub.studentName || 'Unknown'}</span>
                                {sub.studentSrCode && sub.studentSrCode !== '—' && (
                                  <> • {sub.studentSrCode}</>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                                {htmlToPlainText(sub.tafSnapshot.background) || 'No background provided.'}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-xs text-gray-400">
                                v{sub.analysisVersion}
                              </span>
                              <span className="text-xs text-gray-400">
                                {new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="text-xs text-gray-400">
                                {sub.combinedScore}% similarity
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────────────────────────────── */}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              item.active
                ? 'text-[#8B1A1A]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.icon}
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────────────────────────────────── */}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Advisory Group</DialogTitle>
            <DialogDescription>
              Update the details of your advisory group.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateGroup} className="space-y-4 pt-4">
            {updateError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {updateError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Group Name *</Label>
              <Input
                id="edit-name"
                placeholder="e.g., Capstone Group A"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={updating}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Brief description of this advisory group..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={updating}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setEditDialogOpen(false)}
                disabled={updating}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={updating}
              >
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Advisory Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{group?.name}</strong>? This action cannot be undone and all associated data will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteGroup}
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

      {/* ── Remove Student Confirmation ─────────────────────────────── */}
      <ConfirmDeleteModal
        open={!!removingStudent}
        onOpenChange={(open) => {
          if (!open) setRemovingStudent(null);
        }}
        onConfirm={handleRemoveStudent}
        loading={removeBusy}
        variant="warning"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        title="Remove student from group"
        description={
          removingStudent
            ? `Remove ${formatName({
                firstName: removingStudent.firstName,
                middleInitial: removingStudent.middleInitial,
                lastName: removingStudent.lastName,
                suffix: undefined,
              })} from "${group?.name}"? They will need a join code to rejoin. Any TAF they already submitted stays with you and keeps its approval trail.`
            : ""
        }
      />

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* VIEW SUBMISSION DIALOG — removed; now routes to /submission/[id] */}
      {/* ════════════════════════════════════════════════════════════════ */}
    </div>
  );
}
