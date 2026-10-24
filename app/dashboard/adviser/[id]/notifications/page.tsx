'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getAdviserNotificationsData } from '@/server/actions/adviser-shell'
import { UserMenu } from '@/components/user-menu'
import { rolePath } from '@/lib/constants'
import { groupSlug } from '@/lib/slug'
import {
  markNotificationsRead,
  type ApprovalNotification,
  type ApprovalListItem,
} from '@/server/actions/approval-workflow'
import { Loader2, Bell, BellOff, MessageSquare, ArrowLeft, CheckCircle2, CornerDownLeft, Users, UserMinus } from 'lucide-react'

export default function AdviserNotificationsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const urlUserId = params.id

  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifs, setNotifs] = useState<ApprovalNotification[]>([])
  const [pending, setPending] = useState<ApprovalListItem[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // ONE round trip. This used to be getCurrentUser() followed by a
      // Promise.all of two more server actions — but server actions are queued,
      // so that was three sequential browser round trips before the list
      // appeared. The bundle resolves all three in parallel, server-side.
      const data = await getAdviserNotificationsData()
      if (cancelled) return
      if (!data.success) {
        router.replace('/login')
        return
      }
      const u = data.user
      if (u.role !== 'adviser') {
        router.replace(`${rolePath(u.role)}/${u.id}`)
        return
      }
      setUser(u)

      // Same error precedence as before (pending overwrites notifications).
      if (data.notificationsError) setErr(data.notificationsError)
      if (data.pendingError) setErr(data.pendingError)
      setNotifs(data.notifications)
      setPending(data.pendingApprovals)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [router])

  function openSubmission(item: ApprovalListItem) {
    const slug =
      item.groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'group'
    router.push(`/dashboard/adviser/${urlUserId}/group/${slug}/submission/${item.id}`)
  }

  async function openNotification(n: ApprovalNotification) {
    // Navigate FIRST — the mark-read call must never be able to swallow the
    // click (an awaited rejection made the row feel dead before).
    const slug = groupSlug(n.groupName);
    const href = n.submissionId
      ? `/dashboard/adviser/${urlUserId}/group/${slug}/submission/${n.submissionId}`
      : `/dashboard/adviser/${urlUserId}/group/${slug}`;

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
    window.dispatchEvent(new Event('aithink-notifications-read'));

    router.push(href);
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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 shadow-sm">
        <span className="text-lg font-semibold text-[#333]">Notifications</span>
        <UserMenu user={user} userId={urlUserId} routeBase="/dashboard/adviser" />
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button
          onClick={() => router.push(`/dashboard/adviser/${urlUserId}`)}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-[#8B1A1A] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
            <Bell className="h-6 w-6 text-[#8B1A1A]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#333]">Notifications</h1>
            <p className="text-sm text-gray-500">Assigned approvals and updates for your advisory groups.</p>
          </div>
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">{err}</div>
        )}

        {/* Assigned approvals */}
        <h2 className="mb-2 text-sm font-semibold text-[#333] flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#8B1A1A]" />
          Assigned Approvals
        </h2>
        {pending.length === 0 ? (
          <div className="mb-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
            <BellOff className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">You have no TAFs assigned for approval right now.</p>
          </div>
        ) : (
          <div className="mb-8 space-y-2">
            {pending.map((n) => (
              <button
                key={n.id}
                onClick={() => openSubmission(n)}
                className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                  <MessageSquare className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-[#333]">{n.proposedTitle}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {n.studentName} ({n.studentSrCode || '—'}) · {n.groupName}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Awaiting your approval
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Notification history */}
        <h2 className="mb-2 text-sm font-semibold text-[#333] flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#8B1A1A]" />
          History
        </h2>
        {notifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
            <BellOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => void openNotification(n)}
                className="flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 hover:shadow-sm transition-colors cursor-pointer"
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    n.readAt ? 'bg-gray-100' : 'bg-[#8B1A1A]/10'
                  }`}
                >
                  {n.type === 'fully_approved' ? (
                    <CheckCircle2 className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-green-600'}`} />
                  ) : n.type === 'returned_to_student' ? (
                    <CornerDownLeft className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-amber-600'}`} />
                  ) : n.type === 'joined_group' ? (
                    <Users className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-[#8B1A1A]'}`} />
                  ) : n.type === 'left_group' ? (
                    <UserMinus className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-amber-600'}`} />
                  ) : (
                    <Bell className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-[#8B1A1A]'}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.readAt ? 'text-gray-500' : 'text-[#333] font-medium'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmt(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#8B1A1A]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}