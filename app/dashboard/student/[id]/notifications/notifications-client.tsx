'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { UserMenu } from '@/components/user-menu'
import { groupSlug } from '@/lib/slug'
import {
  markNotificationsRead,
  markAllNotificationsRead,
  type ApprovalNotification,
} from '@/server/actions/approval-workflow'
import { Loader2, Bell, BellOff, ArrowLeft, CheckCircle2, CornerDownLeft, CheckCheck } from 'lucide-react'

type Props = {
  /** Supplied by the SERVER (see page.tsx). Identity and the notification list
   *  arrive with the first render, so this page fires no data round trips on
   *  mount — it used to fire two, one after the other. */
  initialUser: CurrentUser;
  initialNotifications: ApprovalNotification[];
  initialError: string | null;
};

export default function StudentNotificationsPage({
  initialUser,
  initialNotifications,
  initialError,
}: Props) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const urlUserId = params.id

  // Identity and the list come from the server; the role guard already ran in
  // page.tsx before this component rendered.
  const user: CurrentUser | null = initialUser
  const loading = false
  const [notifs, setNotifs] = useState<ApprovalNotification[]>(initialNotifications)
  const err = initialError

  /** Where a notification should take the student. Always returns a route —
   *  a notification must never be a dead click. */
  function hrefForNotification(n: ApprovalNotification): string {
    const base = `/dashboard/student/${urlUserId}`;
    const slug = groupSlug(n.groupName);
    if (n.submissionId) {
      // The submission route needs the group slug; without a group name
      // (legacy rows) fall back to the TAF list rather than a URL that 404s.
      return n.groupName
        ? `${base}/group/${slug}/submission/${n.submissionId}`
        : `${base}/taf`;
    }
    if (n.groupId) {
      return n.groupName ? `${base}/group/${slug}` : `${base}/group`;
    }
    return `${base}/taf`;
  }

  async function openNotification(n: ApprovalNotification) {
    // NAVIGATE FIRST. The mark-read call used to be awaited before the
    // navigation, so any failure/rejection from it swallowed the click and the
    // notification felt dead. It is a side effect now, never a blocker.
    const href = hrefForNotification(n);

    if (!n.readAt) {
      setNotifs((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
    }
    void markNotificationsRead({
      submissionId: n.submissionId || undefined,
      groupId: n.groupId || undefined,
    }).catch(() => {
      // Read-state is cosmetic — never let it block navigation.
    });
    // Tell every mounted useUnreadNotifications badge to decrement now.
    window.dispatchEvent(new Event('aithink-notifications-read'));

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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 shadow-sm">
        <span className="text-lg font-semibold text-[#333]">Notifications</span>
        <UserMenu user={user} userId={urlUserId} routeBase="/dashboard/student" />
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button
          onClick={() => router.push(`/dashboard/student/${urlUserId}`)}
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
                Updates on your submitted TAFs — comments, approvals, and returns.
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

        {/* Notification history */}
        {notifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <BellOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No notifications yet.</p>
            <p className="text-xs text-gray-300 mt-1">
              You&apos;ll be notified when someone comments on your TAF, when it&apos;s returned for revision, and when it&apos;s fully approved.
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
                    ) : n.type === 'returned_to_student' ? (
                      <CornerDownLeft className={`h-4 w-4 ${n.readAt ? 'text-gray-400' : 'text-amber-600'}`} />
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