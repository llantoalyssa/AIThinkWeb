"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  CheckCircle2,
  CornerDownLeft,
  Menu,
  Star,
  X,
} from "lucide-react";

import type { CurrentUser } from "@/server/actions/auth";
import {
  markAllNotificationsRead,
  markNotificationsRead,
  type ApprovalNotification,
} from "@/server/actions/approval-workflow";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import {
  departmentNav,
  departmentNotificationsHref,
} from "../department-nav";

type Props = {
  initialUser: CurrentUser;
  initialNotifications: ApprovalNotification[];
  initialError: string | null;
};

export default function DepartmentNotificationsPage({
  initialUser,
  initialNotifications,
  initialError,
}: Props) {
  const router = useRouter();
  const userId = initialUser.id;

  const [notifs, setNotifs] = useState<ApprovalNotification[]>(
    initialNotifications,
  );
  const [err, setErr] = useState<string | null>(initialError);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = departmentNav(userId);
  const allHref = departmentNotificationsHref(userId);
  function markOneRead(n: ApprovalNotification) {
    setNotifs((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
    );
    void markNotificationsRead({ id: n.id })
      .then(() => {
        window.dispatchEvent(new Event("aithink-notifications-read"));
      })
      .catch(() => {

      });
  }

  async function markAllRead() {
    setNotifs((prev) =>
      prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })),
    );
    try {
      const res = await markAllNotificationsRead();
      if (!res.success) {
        setErr(res.error ?? "Could not mark all as read. Please try again.");
      } else {
        window.dispatchEvent(new Event("aithink-notifications-read"));
      }
    } catch {
      setErr("Could not mark all as read. Please try again.");
    }
  }

  function fmt(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        {}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={allHref}
          hrefFor={() => null}
        />
        <UserMenu
          user={initialUser}
          userId={userId}
          routeBase="/dashboard/department"
        />
      </header>

      <div className="flex flex-1 relative">
        {}
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? "w-48" : "w-16"
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  item.href ? router.push(item.href) : router.push(`/dashboard/department/${userId}`)
                }
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  item.id === "notifications"
                    ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                } ${sidebarExpanded ? "" : "justify-center"} cursor-pointer`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span>{item.label}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {}
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
                      setMobileMenuOpen(false);
                      if (item.href) router.push(item.href);
                      else router.push(`/dashboard/department/${userId}`);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      item.id === "notifications"
                        ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
                  <Bell className="h-6 w-6 text-[#8B1A1A]" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[#333]">Notifications</h1>
                  <p className="text-sm text-gray-500">
                    System feedback posted by users, plus account activity.
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
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            {notifs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
                <BellOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet.</p>
                <p className="text-xs text-gray-300 mt-1">
                  You&apos;ll be notified about account activity here.
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
                      onClick={() => markOneRead(n)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer"
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          n.readAt ? "bg-gray-100" : "bg-[#8B1A1A]/10"
                        }`}
                      >
                        {n.type === "fully_approved" ? (
                          <CheckCircle2
                            className={`h-4 w-4 ${n.readAt ? "text-gray-400" : "text-green-600"}`}
                          />
                        ) : n.type === "new_feedback" ? (
                          <Star
                            className={`h-4 w-4 ${n.readAt ? "text-gray-400" : "text-amber-500"}`}
                          />
                        ) : n.type === "returned_to_student" ||
                          n.type === "new_comment" ? (
                          <CornerDownLeft
                            className={`h-4 w-4 ${n.readAt ? "text-gray-400" : "text-amber-600"}`}
                          />
                        ) : (
                          <Bell
                            className={`h-4 w-4 ${n.readAt ? "text-gray-400" : "text-[#8B1A1A]"}`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            n.readAt ? "text-gray-500" : "text-[#333] font-medium"
                          }`}
                        >
                          {n.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmt(n.createdAt)}
                        </p>
                      </div>
                      {!n.readAt && (
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#8B1A1A]" />
                      )}
                    </button>
                    {!n.readAt && (
                      <button
                        type="button"
                        onClick={() => markOneRead(n)}
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg border border-gray-200 text-gray-400 hover:border-[#8B1A1A] hover:text-[#8B1A1A] transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}