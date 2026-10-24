"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  CornerDownLeft,
  Inbox,
  Loader2,
} from "lucide-react";
import {
  getMyNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  type ApprovalNotification,
} from "@/server/actions/approval-workflow";
const MAX_VISIBLE = 5;

type Props = {

  routerPush: (href: string) => void;

  allHref: string;

  hrefFor: (n: ApprovalNotification) => string | null;
  initialNotifications?: ApprovalNotification[];
};

export default function NotificationBell({
  routerPush,
  allHref,
  hrefFor,
  initialNotifications,
}: Props) {
  const pathname = usePathname();
  const [notifs, setNotifs] = useState<ApprovalNotification[]>(
    initialNotifications ?? [],
  );
  const [loading, setLoading] = useState(!initialNotifications);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const didInitialLoad = useRef(false);

  const refresh = useCallback(async () => {
    const res = await getMyNotifications();
    if (res.success) setNotifs(res.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getMyNotifications();
      if (cancelled) return;
      if (res.success) setNotifs(res.data);
      setLoading(false);
    }
    if (!didInitialLoad.current && initialNotifications) {
      didInitialLoad.current = true;
      return;
    }
    didInitialLoad.current = true;
    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname, initialNotifications]);
  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    function onRead() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("aithink-notifications-read", onRead);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("aithink-notifications-read", onRead);
    };
  }, [refresh]);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const unreadCount = notifs.filter((n) => !n.readAt).length;
  const visible = notifs.slice(0, MAX_VISIBLE);

  async function openNotification(n: ApprovalNotification) {
    setOpen(false);
    const href = hrefFor(n);
    if (!n.readAt) {
      setNotifs((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );

      void markNotificationsRead({ id: n.id }).catch(() => {});

      window.dispatchEvent(new Event("aithink-notifications-read"));
    }

    if (href) routerPush(href);
  }
  async function markAll() {
    if (!notifs.some((n) => !n.readAt)) return;
    setNotifs((prev) =>
      prev.map((x) => ({ ...x, readAt: new Date().toISOString() })),
    );
    await markAllNotificationsRead();
    window.dispatchEvent(new Event("aithink-notifications-read"));
  }
  function openBell() {
    setOpen((o) => !o);
  }
  async function markOne(n: ApprovalNotification) {
    if (n.readAt) return;
    setNotifs((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
      ),
    );
    await markNotificationsRead({ id: n.id });
    window.dispatchEvent(new Event("aithink-notifications-read"));
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => void openBell()}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
        title="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold text-[#333]">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="rounded px-2 py-1 -mr-2 text-xs text-[#8B1A1A] hover:bg-[#8B1A1A]/5 hover:underline cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#8B1A1A]" />
              </div>
            ) : visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <BellOff className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet.</p>
              </div>
            ) : (
              visible.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openNotification(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openNotification(n);
                    }
                  }}
                  className="flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      !n.readAt ? "bg-[#8B1A1A]/10" : "bg-gray-100"
                    }`}
                  >
                    {n.type === "fully_approved" ? (
                      <CheckCircle2
                        className={`h-4 w-4 ${!n.readAt ? "text-green-600" : "text-gray-400"}`}
                      />
                    ) : n.type === "returned_to_student" ||
                      n.type === "new_comment" ? (
                      <CornerDownLeft
                        className={`h-4 w-4 ${!n.readAt ? "text-amber-600" : "text-gray-400"}`}
                      />
                    ) : n.type === "routed_to_approver" ||
                      n.type === "resubmitted" ? (
                      <Inbox
                        className={`h-4 w-4 ${!n.readAt ? "text-[#8B1A1A]" : "text-gray-400"}`}
                      />
                    ) : (
                      <Bell
                        className={`h-4 w-4 ${!n.readAt ? "text-[#8B1A1A]" : "text-gray-400"}`}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm ${
                        !n.readAt ? "text-[#333] font-bold" : "text-gray-500"
                      }`}
                    >
                      {n.message}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      {fmt(n.createdAt)}
                    </span>
                  </span>
                  {!n.readAt && (
                    <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                      {}
                      <button
                        type="button"
                        title="Mark as read"
                        aria-label="Mark as read"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markOne(n);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-[#8B1A1A] cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <span className="h-2 w-2 rounded-full bg-[#8B1A1A]" />
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {
}
          {!loading && notifs.length > MAX_VISIBLE && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                routerPush(allHref);
              }}
              className="w-full border-t px-4 py-2 text-center text-xs text-[#8B1A1A] hover:bg-gray-50 cursor-pointer"
            >
              View all
            </button>
          )}
        </div>
      )}
    </div>
  );
}