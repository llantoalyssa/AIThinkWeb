'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type RecentTAFEntry } from '@/server/actions/recents'
import { submitFeedback } from '@/server/actions/feedback'
import RecentTafs from '@/components/recent-tafs'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { UserMenu } from '@/components/user-menu'
import { toast } from 'sonner'
import { Loader2, Home, FilePlus, Users, LogOut, Star, Bell, User, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'

type NavItem = { id: string; icon: React.ReactNode; label: string; href: string; badge?: number }

type Props = {
  initialUser: CurrentUser;
  initialUnreadCount: number;

  initialRecents?: RecentTAFEntry[];
};

export default function StudentFeedbackPage({
  initialUser,
  initialUnreadCount,
  initialRecents,
}: Props) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const userId = params.id
  const unreadCount = useUnreadNotifications(userId, initialUnreadCount)

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: <Home className="h-5 w-5" />, label: 'Dashboard', href: `/dashboard/student/${userId}` },
    { id: 'taf', icon: <FilePlus className="h-5 w-5" />, label: 'Topic Abstract Form', href: `/dashboard/student/${userId}/taf` },
    { id: 'advisory-group', icon: <Users className="h-5 w-5" />, label: 'Advisory Group', href: `/dashboard/student/${userId}/group` },
    { id: 'feedback', icon: <Star className="h-5 w-5" />, label: 'Feedback', href: `/dashboard/student/${userId}/feedback` },
    { id: 'notifications', icon: <Bell className="h-5 w-5" />, label: 'Notifications', href: `/dashboard/student/${userId}/notifications`, badge: unreadCount },
  ]

  const currentUser: CurrentUser | null = initialUser
  const loading = false
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) { toast.error('Please select a rating.'); return }
    const comment = description.trim()

    if (comment && comment.length < 10) { toast.error('Your feedback must be at least 10 characters.'); return }
    setSubmitting(true)
    const res = await submitFeedback({ rating, description: comment })
    setSubmitting(false)
    if (res.success) {
      toast.success(res.message)
      setRating(0)
      setDescription('')
    } else {
      toast.error(res.error)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>
        <UserMenu user={currentUser} userId={userId} routeBase="/dashboard/student" />
      </header>

      <div className="flex flex-1 relative">
        {}
        <aside className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${sidebarExpanded ? 'w-56' : 'w-16'} shrink-0`}>
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => router.push(item.href)} className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.id === 'feedback' ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} ${sidebarExpanded ? '' : 'justify-center'}`} title={item.label}>
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

        {}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-56 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button key={item.id} onClick={() => { router.push(item.href); setMobileMenuOpen(false) }} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${item.id === 'feedback' ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
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

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#333]">Feedback</h1>
              <p className="text-sm text-gray-500 mt-1">
                Tell us how the system is working for you. Your feedback helps us improve.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
              {}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#333]">How would you rate the system?</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="cursor-pointer transition-transform hover:scale-110"
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={`h-9 w-9 ${(hoverRating || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                      />
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {rating ? (rating === 1 ? 'Very Poor' : rating === 2 ? 'Poor' : rating === 3 ? 'Average' : rating === 4 ? 'Good' : 'Excellent') : 'No rating selected'}
                </p>
              </div>

              {}
              <div>
                <label htmlFor="feedback-desc" className="mb-1 block text-sm font-medium text-[#333]">
                  Your feedback <span className="text-xs font-normal text-gray-400">(optional · min 10 characters)</span>
                </label>
                <textarea
                  id="feedback-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Share what you like, what could be improved, or any issues you encountered..."
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                />
                <p className="mt-1 text-xs text-gray-400 text-right">{description.length}/2000</p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#8B1A1A] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  Submit Feedback
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>

      {}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button key={item.id} onClick={() => router.push(item.href)} className={`relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${item.id === 'feedback' ? 'text-[#8B1A1A]' : 'text-gray-400 hover:text-gray-600'}`}>
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

      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  )
}