"use client";

// ============================================================
// DepartmentShell — the department role's page frame (header + side
// nav + content), shared by its ROUTED pages (Notifications, Audit
// Trail). The dashboard keeps its own layout MARKUP because its nav
// items switch in-page sections — but it renders the same shared nav
// list (navItemsFor, which is backed by departmentNav).
//
// The notification BELL lives in this header, so every department page
// shows it (it used to exist only on Profile, where ProfileSettingsPage
// renders it).
//
// `children` may be SERVER-rendered — pass it down from a server page and
// the table ships with the first paint.
// ============================================================

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";

import type { CurrentUser } from "@/server/actions/auth";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { departmentNotificationsHref } from "@/app/dashboard/department/[id]/department-nav";
import { navItemsFor } from "@/components/nav-items";
import SidebarCollapseHandle from "@/components/sidebar-collapse-handle";

type Props = {
  user: CurrentUser;
  userId: string;
  /**
   * Nav id to highlight (matches a navItemsFor() / departmentNav() id).
   * Omit it when the shell is rendered by the [id] LAYOUT — the item is then
   * derived from the URL, so the highlight updates the moment you click instead
   * of waiting for the destination page to render.
   */
  active?: string;
  /**
   * The account's EFFECTIVE permission keys (getGrantedPermissions). The
   * department obeys the same permission set as every other role, so the nav
   * must be filtered by them — pass the set from the server page. Left
   * undefined the nav renders whole, which is the pre-permission behaviour.
   */
  permissions?: string[];
  children: ReactNode;
};

/**
 * Which nav item the current URL belongs to.
 *
 * Longest href wins so a deeper route can never be shadowed by a shorter one,
 * and a `?section=` URL only lights up the section item it names (otherwise
 * "Users" would glow on every /dashboard/department/<id> route).
 */
function resolveActiveId(
  items: { id: string; href?: string }[],
  pathname: string,
  section: string | null,
  userId: string,
): string {
  const base = `/dashboard/department/${userId}`;
  const currentSection = section || "users";
  let best: { id: string; length: number } | null = null;

  for (const item of items) {
    if (!item.href) continue;
    const [path, query] = item.href.split("?");
    if (path !== pathname) continue;
    const wantedSection = new URLSearchParams(query ?? "").get("section");
    if (wantedSection && wantedSection !== currentSection) continue;
    if (!wantedSection && query) continue;
    const length = item.href.length;
    if (!best || length > best.length) best = { id: item.id, length };
  }

  return best?.id ?? "";
}

export default function DepartmentShell({ user, userId, active, permissions, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // The ONE shared source (components/nav-items.tsx). No local copy here.
  const navItems = navItemsFor({ role: "department", userId, permissions });
  const activeId =
    active ?? resolveActiveId(navItems, pathname, searchParams.get("section"), userId);
  const notificationsHref = departmentNotificationsHref(userId);
  // Same source as the bell (and it listens to the aithink-notifications-read
  // event), so the side-nav badge can never disagree with the bell.
  const unreadCount = useUnreadNotifications(userId);

  /** Routed items navigate; section items fall back to the dashboard. */
  function goTo(item: { id: string; href?: string }) {
    router.push(item.href ?? `/dashboard/department/${userId}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>


        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={notificationsHref}
          /* A notification MUST have a destination. `() => null` made every row
             in the bell a dead click for this role — the panel opened, the click
             marked it read, and nothing navigated. Approvals open the department's
             own TAF view; anything else lands on the TAF Submissions queue. */
          hrefFor={(n) => {
            if (n.submissionId) {
              return `/dashboard/department/${userId}/submission/${n.submissionId}`;
            }
            // Feedback notifications carry no submission — they used to be sent
            // to the TAF Submissions queue, which has nothing to do with them.
            if (n.type === "new_feedback") {
              return `/dashboard/department/${userId}?section=feedback`;
            }
            if (n.groupId) {
              return `/dashboard/department/${userId}?section=groups`;
            }
            return `/dashboard/department/${userId}?section=submissions`;
          }}
        />
        <UserMenu user={user} userId={userId} routeBase="/dashboard/department" />
      </header>

      <div className="flex flex-1 relative">
        {/* relative + group/sidebar: the wrapper positions the collapse handle on
            the nav's inner edge and reveals it on hover. The aside itself keeps
            overflow-y-auto, which would clip an absolutely-positioned child. */}
        <div className="group/sidebar relative hidden shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] md:block">
        <aside
          className={`flex h-full flex-col border-r bg-white transition-all duration-200 overflow-y-auto ${
            sidebarExpanded ? "w-64" : "w-16"
          }`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => goTo(item)}
                // Warm the destination route before the click.
                onMouseEnter={() => router.prefetch(item.href ?? `/dashboard/department/${userId}`)}
                onFocus={() => router.prefetch(item.href ?? `/dashboard/department/${userId}`)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeId === item.id
                    ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                } ${sidebarExpanded ? "" : "justify-center"} cursor-pointer`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span className="flex-1 text-left truncate">{item.label}</span>}
                {sidebarExpanded && item.id === "notifications" && unreadCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>
          <SidebarCollapseHandle
            expanded={sidebarExpanded}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>

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
                    onClick={() => {
                      setMobileMenuOpen(false);
                      goTo(item);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      activeId === item.id
                        ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.id === "notifications" && unreadCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* flex-col + mt-auto on the footer: the footer sits at the bottom of the
            viewport on a short page instead of floating right under the content
            (which is what happened once the chrome moved into the layout). */}
        <main className="flex flex-1 flex-col overflow-auto">
          <div className="flex-1">{children}</div>
          <footer className="mt-auto hidden bg-[#8B1A1A] py-3 text-center text-xs text-white md:block">
            <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
