'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { type CurrentUser } from '@/server/actions/auth'
import { type TopicAbstractForm } from '@/server/actions/topic-abstracts'
import { type RecentTAFEntry } from '@/server/actions/recents'
import { addRecentTAF } from '@/server/actions/recents'
import TopicAbstractFormEditor from '@/components/topic-abstract-form-editor'
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";
import RecentTafs from '@/components/recent-tafs'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { UserMenu } from '@/components/user-menu'
import { navItemsFor, type NavItem } from '@/components/nav-items'
import {
  Loader2,
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
  /** Supplied by the SERVER (see page.tsx): identity, the badge, the TAF that
   *  is being edited (with its submitted-to-group state) and the sidebar
   *  recents. Nothing is fetched on mount here any more — the six queued round
   *  trips this page used to fire are gone. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
  /** The TAF being edited, or null/absent for the "new TAF" route. */
  initialTaf?: TopicAbstractForm | null;
  initialDisableAnalyze: boolean;
  initialSubmissionUrl?: string;
  initialSubmissionStatus?: string;
  /** Absent when the server fetch failed — the child then loads its own. */
  initialRecents?: RecentTAFEntry[];
};

export default function StudentTafEditorPage({
  initialUser,
  initialUnreadCount,
  initialTaf,
  initialDisableAnalyze,
  initialSubmissionUrl,
  initialSubmissionStatus,
  initialRecents,
}: Props) {
  const router = useRouter();
  const params = useParams<{ id: string; tafId: string; slug: string }>();
  const userId = params.id;
  const tafId = params.tafId;
  const isNew = tafId === 'new';
  const unreadCount = useUnreadNotifications(userId, initialUnreadCount);

  // The student's five items come from the ONE shared source.
  const navItems: StudentNavItem[] = navItemsFor({ role: 'student', userId }).map(
    (item): StudentNavItem => ({
      ...item,
      href: item.href ?? '',
      badge: item.id === 'notifications' ? unreadCount : undefined,
    }),
  );

  const currentUser: CurrentUser | null = initialUser;
  const loading = false;
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const title = isNew ? '' : initialTaf?.proposedTitle || 'Untitled';
  const disableAnalyze = initialDisableAnalyze;
  const submissionUrl = initialSubmissionUrl;
  const submissionStatus = initialSubmissionStatus;

  // ── Track this visit in recents ─────────────────────────────────
  // Fire-and-forget: it used to be awaited BEFORE the page stopped loading,
  // which put a whole extra queued round trip in front of the first paint.
  // Ordering is unchanged (the page's own data already arrived) and the entry
  // is still written for the sidebar's recents list.
  useEffect(() => {
    if (isNew || !initialTaf) return;
    void addRecentTAF(
      initialTaf.id,
      initialTaf.proposedTitle || 'Untitled',
      initialTaf.status,
    ).catch(() => {
      // Recents tracking is cosmetic — never let it affect the page.
    });
  }, [isNew, initialTaf]);

  // ── Close mobile menu on resize ─────────────────────────────────
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
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

        <h1 className="text-lg font-semibold text-[#333] flex-1 truncate">
          {isNew ? 'New Topic Abstract' : title || 'Loading...'}
        </h1>

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
              <RecentTafs userId={userId} activeTafId={isNew ? undefined : tafId} initialEntries={initialRecents} />
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
            <TopicAbstractFormEditor
              tafId={isNew ? undefined : tafId}
              initialTaf={isNew ? undefined : initialTaf ?? undefined}
              onBack={() => router.push(`/dashboard/student/${userId}/taf`)}
              onSaved={() => router.push(`/dashboard/student/${userId}/taf`)}
              disableAnalyze={disableAnalyze}
              submissionUrl={submissionUrl}
              submissionStatus={submissionStatus}
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
