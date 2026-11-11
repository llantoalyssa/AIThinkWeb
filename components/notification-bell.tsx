"use client";

// Shared top-right notification bell used by every role that has one
// (adviser, associate dean, dean, vcrdes). It lists the user's APPROVAL
// NOTIFICATIONS (not the pending-approvals queue) so the badge matches the
// sidebar Notifications badge and can decrement as items are viewed.
//
// Behaviour:
//  - badge = count of UNREAD notifications, and it decrements the moment a
//    notification is opened (the same "aithink-notifications-read" event the
//    sidebar badge listens to keeps every surface in sync)
//  - the dropdown shows at most MAX_VISIBLE (5) most-recent notifications with
//    a "View all" link to the full notifications page
//  - re-syncs on window focus, on route change and on the global read event

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  markNotificationsRead,
  markAllNotificationsRead,
  type ApprovalNotification,
} from "@/server/actions/approval-workflow";
import { getNotificationBellShell } from "@/server/actions/approver-shell";

/** Maximum number of notifications shown inside the bell dropdown. */
const MAX_VISIBLE = 5;

/**
 * Context handed to `hrefFor`. `ownedGroupSlug` is set when the notification's
 * submission belongs to a group the CALLER OWNS — the same discriminator the
 * notifications page uses — so an href builder can keep an owned-group
 * submission inside its group. Absent for every other notification, which
 * therefore keeps the destination it has always had.
 */
export type NotificationHrefContext = { ownedGroupSlug?: string };

type Props = {
  /** Navigation used for every link (pass the page's router.push). */
  routerPush: (href: string) => void;
  /** "View all" destination — the role's notifications page. */
  allHref: string;
  /** Builds the destination for a notification; return null to stay put. */
  hrefFor: (n: ApprovalNotification, ctx: NotificationHrefContext) => string | null;
  /**
   * Optional server-supplied notifications (bundled with the page's other
   * mount data). When given, the FIRST load is skipped — the bell renders
   * from this list immediately and only re-syncs on a later route change,
   * on window focus, or after a read event. Absent → fetches as before.
   */
  initialNotifications?: ApprovalNotification[];
  /**
   * Resolve, with each load, which of these notifications belong to a group the
   * caller OWNS, and pass the slug to `hrefFor`. Opt-in: only the surfaces that
   * route owned-group submissions need it (the approver ones), so every other
   * bell keeps its current fetch and destinations untouched.
   */
  withOwnedGroupSlugs?: boolean;
  /** The same map, when the notifications came from a server shell. */
  initialOwnedGroupSlugs?: Record<string, string>;
};

export default function NotificationBell({
  routerPush,
  allHref,
  hrefFor,
  initialNotifications,
  withOwnedGroupSlugs = false,
  initialOwnedGroupSlugs,
}: Props) {
  const pathname = usePathname();
  const [notifs, setNotifs] = useState<ApprovalNotification[]>(
    initialNotifications ?? [],
  );
  /** submissionId → owned group slug (empty unless withOwnedGroupSlugs). */
  const [ownedGroupSlugs, setOwnedGroupSlugs] = useState<Record<string, string>>(
    initialOwnedGroupSlugs ?? {},
  );
  const [loading, setLoading] = useState(!initialNotifications);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // True once the first load has been resolved (either from the server-supplied
  // list or from our own fetch) — later route changes always refresh.
  const didInitialLoad = useRef(false);

  const refresh = useCallback(async () => {
    const res = await getNotificationBellShell(withOwnedGroupSlugs);
    if (res.success) {
      setNotifs(res.notifications);
      setOwnedGroupSlugs(res.ownedGroupSlugs);
    }
    setLoading(false);
  }, [withOwnedGroupSlugs]);

  // Initial load + refresh on every route change (a notification may have been
  // read on the notifications page).
  //
  // NOTE: this must go through an async function whose FIRST statement is an
  // await. Calling refresh() directly in the effect body trips the
  // `react-hooks/set-state-in-effect` rule, which is an ERROR in this project —
  // an error fails `next build` ("Failed to compile."), which is what broke the
  // Vercel deployment.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getNotificationBellShell(withOwnedGroupSlugs);
      if (cancelled) return;
      if (res.success) {
        setNotifs(res.notifications);
        setOwnedGroupSlugs(res.ownedGroupSlugs);
      }
      setLoading(false);
    }
    // A server-supplied list (from the page's bundled shell action) already
    // covers the initial load — skip the fetch for THIS first run only, so
    // later route changes still re-sync.
    if (!didInitialLoad.current && initialNotifications) {
      didInitialLoad.current = true;
      return;
    }
    didInitialLoad.current = true;
    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname, initialNotifications, withOwnedGroupSlugs]);

  // Re-sync on focus and right after any surface marks notifications read.
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

  // Outside-click close.
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

    // Compute the destination BEFORE the mark-read call so a failure there can
    // never leave the click doing nothing. The owned-group slug (when this
    // submission is in a group the caller owns) is resolved at LOAD time, so
    // the builder stays synchronous and lands where the notifications page
    // would send the same notification.
    /**
     * Archived group → DO NOT navigate.
     *
     * The TAF is out of the approval queues (getPendingApprovals filters it) and
     * every decision/comment on it is refused, so opening it only produces a dead
     * end. The same message the approve/return guard returns explains why, and
     * the notification is left UNREAD so it becomes actionable again the moment
     * the adviser unarchives the group.
     */
    if (n.groupArchived) {
      toast.info("This advisory group has been archived", {
        description:
          "Its TAF is paused until the adviser unarchives the group — you can open it again after that.",
      });
      return;
    }

    const href = hrefFor(n, {
      ownedGroupSlug: n.submissionId
        ? ownedGroupSlugs[n.submissionId]
        : undefined,
    });

    // Mark read optimistically so the badge decrements immediately.
    if (!n.readAt) {
      setNotifs((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      // Fire-and-forget: read-state is cosmetic, navigation is not.
      void markNotificationsRead({ id: n.id }).catch(() => {});
      // Tell the sidebar badge (and any other mounted bell) to decrement now.
      window.dispatchEvent(new Event("aithink-notifications-read"));
    }

    if (href) routerPush(href);
  }

  // Mark EVERY unread notification read. Optimistic so the badge (this one,
  // the sidebar's and any other mounted surface) drops immediately.
  async function markAll() {
    if (!notifs.some((n) => !n.readAt)) return;
    setNotifs((prev) =>
      prev.map((x) => ({ ...x, readAt: new Date().toISOString() })),
    );
    await markAllNotificationsRead();
    window.dispatchEvent(new Event("aithink-notifications-read"));
  }

  // Opening/closing the bell is now JUST a toggle. It deliberately does NOT
  // mark everything read any more — each notification is marked read
  // individually (clicking the row, or the small ✓ button), so opening the
  // bell never un-bolds the ones you haven't actually looked at.
  function openBell() {
    setOpen((o) => !o);
  }

  // Mark ONE notification read (used by the per-row ✓ button).
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

      {/* `-mr-3` on phones nudges the panel 12px further right: the bell sits one
          gap left of the avatar, so plain `right-0` left a visible hole between
          the panel and the screen edge. Desktop keeps the unshifted position, and
          the width cap leaves room so the shift can never clip. */}
      {open && (
        <div className="absolute right-0 top-12 z-50 -mr-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:mr-0">
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
                      className={`block text-sm line-clamp-2 ${
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
                      {/* Mark THIS one read without opening it. */}
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

          {/* "View all" is ALWAYS available once the list has loaded.
              It used to appear only when the list overflowed the visible cap, so
              a student with a handful of notifications had no route to their
              inbox at all — the bell is the only entry point (no side-nav item),
              and the panel was a dead end. */}
          {!loading && (
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
