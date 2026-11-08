'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type TopicAbstractForm } from '@/server/actions/topic-abstracts'
import { type RecentTAFEntry } from '@/server/actions/recents'
import TopicAbstractList from '@/components/topic-abstract-list'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import RecentTafs from '@/components/recent-tafs'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import NotificationBell from '@/components/notification-bell'
import { UserMenu } from '@/components/user-menu'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'

/** Student nav items come from the ONE shared source (components/nav-items.tsx).
 *  Two things stay caller-side by design: the unread NOTIFICATIONS badge
 *  (wiring keyed on item.id) and the href, which studentItems() always sets. */
type StudentNavItem = NavItem & { href: string; badge?: number };

type Props = {
  /** All of the below are fetched on the SERVER (see page.tsx) and handed down,
   *  so this page performs ZERO data round trips after navigation — the whole
   *  content ships with the RSC payload. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  initialTafs: TopicAbstractForm[];
  initialRecents: RecentTAFEntry[];
};

export default function StudentTafPage({
  initialUser,
  initialUnreadCount,
  initialTafs,
  initialRecents,
}: Props) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const unreadCount = useUnreadNotifications(userId, initialUnreadCount);

  // The student's five items come from the ONE shared source.
  const navItems: StudentNavItem[] = navItemsFor({ role: 'student', userId }).map(
    (item): StudentNavItem => ({
      ...item,
      href: item.href ?? '',
      badge: item.id === 'notifications' ? unreadCount : undefined,
    }),
  );

  // Identity and the role/URL-id checks live in page.tsx (server) and run
  // before this component renders — no auth round trip here any more.
  const currentUser = initialUser;
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Close mobile menu on resize ────────────────────────────────────────
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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


        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        {/* Same bell as the dashboard: notifications must be reachable from
            every student surface, not just the landing page. */}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`/dashboard/student/${userId}/notifications`}
          hrefFor={() => `/dashboard/student/${userId}/notifications`}
        />
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
                  item.id === 'taf'
                    ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                } ${sidebarExpanded ? '' : 'justify-center'}`}
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
          {/* Recents section — only visible when sidebar is expanded */}
          {sidebarExpanded && (
            <div className="flex-1 min-h-0 overflow-hidden border-t border-gray-100 mt-2 pt-1">
              <RecentTafs userId={userId} initialEntries={initialRecents} />
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
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
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
                      item.id === 'taf'
                        ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
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
            <TopicAbstractList
              initialTafs={initialTafs}
              onNewForm={() => {
                router.push(`/dashboard/student/${userId}/taf/new/_`);
              }}
              onEditForm={(tafId, proposedTitle) => {
                const slug = proposedTitle
                  ? proposedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                  : 'untitled';
                router.push(`/dashboard/student/${userId}/taf/${tafId}/${slug}`);
              }}
            />
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
