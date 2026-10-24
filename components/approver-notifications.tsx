'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { getApproverNotificationsShell } from '@/server/actions/approver-shell'
import { UserMenu } from '@/components/user-menu'
import { rolePath } from '@/lib/constants'
import {
  markNotificationsRead,
  markAllNotificationsRead,
  type ApprovalNotification,
} from '@/server/actions/approval-workflow'
import { Loader2, Bell, BellOff, ArrowLeft, CheckCircle2, CornerDownLeft, CheckCheck } from 'lucide-react'

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

  useEffect(() => {
    let cancelled = false
    async function load() {
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
      if (shell.notificationsError) setErr(shell.notificationsError)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [router, role])

  async function openNotification(n: ApprovalNotification) {
    const href = n.submissionId
      ? `${rolePath(role)}/${urlUserId}/submission/${n.submissionId}`
      : `${rolePath(role)}/${urlUserId}?tab=pending`;

    if (!n.readAt) {
      setNotifs((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
    }
    void markNotificationsRead({
      submissionId: n.submissionId || undefined,
      groupId: n.groupId || undefined,
    }).catch(() => {

    });

    window.dispatchEvent(new Event("aithink-notifications-read"));

    router.push(href);
  }
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
        <UserMenu user={user} userId={urlUserId} routeBase={rolePath(role)} />
      </header>
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