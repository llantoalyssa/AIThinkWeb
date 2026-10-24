"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";

import type { CurrentUser } from "@/server/actions/auth";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
import {
  departmentNav,
  departmentNotificationsHref,
} from "@/app/dashboard/department/[id]/department-nav";

type Props = {
  user: CurrentUser;
  userId: string;

  active: string;
  children: ReactNode;
};

export default function DepartmentShell({ user, userId, active, children }: Props) {
  const router = useRouter();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = departmentNav(userId);
  const notificationsHref = departmentNotificationsHref(userId);
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

        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={notificationsHref}
          hrefFor={() => null}
        />
        <UserMenu user={user} userId={userId} routeBase="/dashboard/department" />
      </header>

      <div className="flex flex-1 relative">
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? "w-48" : "w-16"
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => goTo(item)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active === item.id
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
                      goTo(item);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      active === item.id
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

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}