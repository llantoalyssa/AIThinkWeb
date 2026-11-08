"use client";

// Shared "unread notifications" count for the sidebar badge, so every page of
// a user's account shows the SAME badge on the Notifications nav item.
//
// Re-sync triggers:
//  - on mount / userId change
//  - on window focus (student may have read notifications elsewhere and
//    navigated back with the app in the background)
//  - on EVERY route change (usePathname) — so after a notification is marked
//    read and the user returns to the dashboard, the badge decrements without
//    needing a manual refresh
//  - on the "aithink-notifications-read" window event, fired by the
//    notifications pages after markNotificationsRead, so the badge updates
//    even on the SAME page that just marked something read.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getMyNotifications } from "@/server/actions/approval-workflow";

/**
 * @param initialCount Unread count already supplied by the SERVER (see
 *   getStudentShell). When given, the mount-time fetch is skipped — that fetch
 *   was a whole round trip per page load, on top of the page's own data calls.
 *   Later re-syncs (focus, route change, mark-read) still run exactly as before.
 */
export function useUnreadNotifications(
  userId: string | undefined,
  initialCount?: number,
): number {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount ?? 0);
  // Skip exactly ONE fetch — the mount one — when the server already told us.
  const skipMountFetchRef = useRef(initialCount !== undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const nr = await getMyNotifications();
      if (!cancelled && nr.success) {
        setCount(nr.data.filter((n) => !n.readAt).length);
      }
    }
    if (!userId) return;
    if (skipMountFetchRef.current) {
      skipMountFetchRef.current = false;
      return;
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  // Re-sync when the tab regains focus.
  useEffect(() => {
    function onFocus() {
      getMyNotifications().then((nr) => {
        if (nr.success) setCount(nr.data.filter((n) => !n.readAt).length);
      });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Re-sync immediately after a notifications page marks something read.
  useEffect(() => {
    function onRead() {
      getMyNotifications().then((nr) => {
        if (nr.success) setCount(nr.data.filter((n) => !n.readAt).length);
      });
    }
    window.addEventListener("aithink-notifications-read", onRead);
    return () =>
      window.removeEventListener("aithink-notifications-read", onRead);
  }, []);

  return count;
}