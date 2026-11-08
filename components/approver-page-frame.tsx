"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ShieldAlert,
} from "lucide-react";

import type { CurrentUser } from "@/server/actions/auth";
import type { ApprovalNotification } from "@/server/actions/approval-workflow";
import ApproverSidebar, {
  approverNavItemsFor,
  type ApproverTab,
} from "@/components/approver-sidebar";
import NotificationBell from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { rolePath, type UserRole } from "@/lib/constants";
export type ApproverPageRole = "adviser" | "associate_dean" | "dean" | "vcrdes";

export default function ApproverPageFrame({
  role,
  urlUserId,
  user,
  permissions,
  children,
}: {
  role: ApproverPageRole;
  urlUserId: string;

  user: CurrentUser;

  permissions: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const base = `${rolePath(role as UserRole)}/${urlUserId}`;
  const navItems = approverNavItemsFor(role, urlUserId, permissions);
  function goTo(item: { tab?: string; href?: string }) {
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (item.tab) router.push(`${base}?tab=${item.tab}`);
  }
  function hrefFor(n: ApprovalNotification): string {
    if (role === "adviser") return `${base}/notifications`;
    if (n.submissionId) return `${base}/submission/${n.submissionId}`;
    if (
      (n.type === "joined_group" || n.type === "left_group") &&
      role !== "vcrdes"
    ) {
      return `${base}?tab=groups`;
    }
    return `${base}?tab=pending`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">AIThink</h1>

        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`${base}/notifications`}
          hrefFor={hrefFor}
        />

        <UserMenu user={user} userId={urlUserId} routeBase={rolePath(role)} />
      </header>

      <div className="flex flex-1 relative">
        {}
        <ApproverSidebar
          expanded={sidebarExpanded}
          items={navItems}
          activeHref={pathname}
          onSelect={(tab: ApproverTab) => goTo({ tab })}
          onToggle={() => setSidebarExpanded((v) => !v)}
        />

        {}
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
                      goTo(item);
                      setMobileMenuOpen(false);
                    }}
                    onMouseEnter={() => {
                      if (item.href) router.prefetch(item.href);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      !!item.href && item.href === pathname
                        ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left truncate">{item.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
export function ApproverNoAccess({
  title,
  message,
  backHref,
}: {
  title: string;
  message: string;
  backHref: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
      <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
      <h3 className="mb-1 text-lg font-medium text-[#333]">{title}</h3>
      <p className="mb-4 max-w-md text-sm text-gray-500">{message}</p>
      <a
        href={backHref}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
      >
        Back to Dashboard
      </a>
    </div>
  );
}