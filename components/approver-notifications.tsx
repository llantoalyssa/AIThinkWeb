'use client'

// ============================================================
// ApproverNotificationsPage — the notifications page for an approver role
// (associate dean / dean / vcrdes).
//
// The chrome is the DASHBOARD's chrome: same header, same ApproverSidebar with
// the SAME permission-aware item list. That is not only cosmetic — a granted
// page item (e.g. "pages.feedback") used to appear on every surface EXCEPT this
// one, because this page had no nav to put it in. The permission set now
// arrives WITH the shell, exactly like the dashboard / review / Feedback
// surfaces, so every surface of a role renders one identical nav.
// ============================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getApproverNotificationsShell } from '@/server/actions/approver-shell'
import { UserMenu } from '@/components/user-menu'
import { toast } from 'sonner'
import NotificationBell from '@/components/notification-bell'
import ApproverSidebar, {
  approverNavItemsFor,
  type ApproverTab,
} from '@/components/approver-sidebar'
import { rolePath } from '@/lib/constants'
import {
  markNotificationsRead,
  markAllNotificationsRead,
  type ApprovalNotification,
} from '@/server/actions/approval-workflow'
import {
  Loader2,
  Bell,
  BellOff,
  ArrowLeft,
  CheckCircle2,
  CornerDownLeft,
  CheckCheck,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

export default function ApproverNotificationsPage({
  role,
  urlUserId,
  onBack,
}: {
  role: 'associate_dean' | 'dean' | 'vcrdes'
  urlUserId: string
  onBack: () => void
}) {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifs, setNotifs] = useState<ApprovalNotification[]>([])
  const [err, setErr] = useState<string | null>(null)
  /** Effective permission keys for this account, seeded by the shell — the nav
   *  uses them to show a GRANTED page item. Empty = today's nav. */
  const [permissions, setPermissions] = useState<string[]>([])
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // ONE bundled call (identity + notifications + grants) instead of two
      // queued server actions run back-to-back.
      const shell = await getApproverNotificationsShell()
      if (cancelled) return
      if (!shell.success) {
        router.replace('/login')
        return
      }
      const u = shell.user
      if (u.role !== role) {
        router.replace(`${rolePath(u.role)}/${u.id}`)
        return
      }
      setUser(u)
      setNotifs(shell.notifications)
      setPermissions(shell.permissions)
      if (shell.notificationsError) setErr(shell.notificationsError)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [router, role])

  // The SAME permission-aware list every other surface of this role renders, so
  // a granted page item cannot vanish merely because the user opened
  // Notifications.
  const navItems = approverNavItemsFor(role, user?.id ?? urlUserId, permissions)

  // A tab item → that dashboard tab; a granted page item → its own route (the
  // href nav-items gave it, re-pointed at this role).
  function goTo(item: { tab?: string; href?: string }) {
    if (item.href) {
      router.push(item.href)
      return
    }
    if (item.tab) router.push(`${rolePath(role)}/${urlUserId}?tab=${item.tab}`)
  }

  async function openNotification(n: ApprovalNotification) {
    // Archived group → do not navigate. The TAF is out of the approval queues and
    // every action on it is refused, so opening it is a dead end; the notice says
    // why, and the notification stays unread until the group is unarchived.
    if (n.groupArchived) {
      toast.info("This advisory group has been archived", {
        description:
          "Its TAF is paused until the adviser unarchives the group — you can open it again after that.",
      });
      return;
    }

    // Navigate FIRST — never let the (cosmetic) mark-read call swallow the
    // click.
    //
    // Routing rules:
    //  • a submission id  → that TAF's review page;
    //  • a group event (someone joined / left) with no submission → the
    //    advisory-group page, which is where the roster lives. That page only
    //    exists for the roles that can own groups (VCRDES cannot);
    //  • anything else    → the TAF Submissions tab.
    const isGroupEvent =
      !n.submissionId && (n.type === "joined_group" || n.type === "left_group");

    // A submission that came from a group the caller OWNS opens inside that
    // group (so Back returns to the group, not to the TAF Submissions tab).
    // Every other notification keeps its current destination: the normal
    // approval-chain notification still goes to TAF Submissions. The TAF also
    // stays listed there, and opening it FROM that list is unaffected — this
    // only changes where the notification itself lands.
    let submissionHref = n.submissionId
      ? `${rolePath(role)}/${urlUserId}/submission/${n.submissionId}`
      : null;

    if (n.submissionId) {
      try {
        const { getOwnedGroupSlugForSubmission } = await import(
          "@/server/actions/group-submissions"
        );
        const owned = await getOwnedGroupSlugForSubmission(n.submissionId);
        if (owned.slug) {
          submissionHref = `${rolePath(role)}/${urlUserId}/group/${owned.slug}/submission/${n.submissionId}`;
        }
      } catch {
        // Resolution is best-effort: fall back to the TAF Submissions route.
      }
    }

    // Feedback notifications have no submission and no group — send them to the
    // role's Feedback page. Without this they fell through to the TAF queue.
    const isFeedbackEvent = n.type === "new_feedback";

    const href =
      submissionHref ??
      (isFeedbackEvent
        ? `${rolePath(role)}/${urlUserId}/feedback`
        : isGroupEvent && role !== "vcrdes"
          ? `${rolePath(role)}/${urlUserId}?tab=groups`
          : `${rolePath(role)}/${urlUserId}?tab=pending`);

    if (!n.readAt) {
      setNotifs((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
    }
    void markNotificationsRead({
      submissionId: n.submissionId || undefined,
      groupId: n.groupId || undefined,
    }).catch(() => {
      // cosmetic — never block navigation
    });
    // Tell every mounted useUnreadNotifications badge to decrement now.
    window.dispatchEvent(new Event("aithink-notifications-read"));

    router.push(href);
  }

  // Mark a SINGLE unread notification read without navigating away.
  async function markOneRead(n: ApprovalNotification) {
    if (n.readAt) return
    setNotifs((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
    )
    await markNotificationsRead({
      submissionId: n.submissionId || undefined,
      groupId: n.groupId || undefined,
    })
    window.dispatchEvent(new Event('aithink-notifications-read'))
  }

  // Mark ALL unread notifications read so the badge drops to zero.
  async function markAllRead() {
    if (!notifs.some((n) => !n.readAt)) return
    setNotifs((prev) =>
      prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })),
    )
    await markAllNotificationsRead()
    window.dispatchEvent(new Event('aithink-notifications-read'))
  }

  function fmt(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {/* The nav had NO mobile entry point on this page at all. */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="flex-1 text-lg font-semibold text-[#333]">Notifications</span>
        <UserMenu user={user} userId={urlUserId} routeBase={rolePath(role)} />
      </header>

      {/* Mobile drawer */}
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
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    goTo(item)
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-[#8B1A1A] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
              <Bell className="h-6 w-6 text-[#8B1A1A]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#333]">Notifications</h1>
              <p className="text-sm text-gray-500">
                TAFs routed to you, approvals, returns, and comments.
              </p>
            </div>
          </div>
          {notifs.some((n) => !n.readAt) && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="flex items-center gap-1.5 rounded-lg border border-[#8B1A1A]/30 px-3 py-1.5 text-xs font-medium text-[#8B1A1A] hover:bg-[#8B1A1A]/5 transition-colors cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">{err}</div>
        )}

        {notifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <BellOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No notifications yet.</p>
            <p className="text-xs text-gray-300 mt-1">
              You&apos;ll be notified when a TAF is routed to you, when it&apos;s approved, and when comments are added.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => (
              <div
                key={n.id}
                className="flex items-stretch gap-2 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 hover:shadow-sm"
              >
                <button
                  onClick={() => void openNotification(n)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.readAt ? 'bg-gray-100' : 'bg-[#8B1A1A]/10'
                    }`}
                  >
                    {n.type === 'fully_approved' ? (
                      <CheckCircle2 className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-green-600'}`} />
                    ) : n.type === 'returned_to_student' || n.type === 'new_comment' ? (
                      <CornerDownLeft className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-amber-600'}`} />
                    ) : (
                      <Bell className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-[#8B1A1A]'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm line-clamp-2 ${n.readAt ? 'text-gray-500' : 'text-[#333] font-medium'}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#8B1A1A]" />
                  )}
                </button>
                {!n.readAt && (
                  <button
                    type="button"
                    onClick={() => void markOneRead(n)}
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg border border-gray-200 text-gray-400 hover:border-[#8B1A1A] hover:text-[#8B1A1A] transition-colors cursor-pointer"
                    title="Mark as read"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}