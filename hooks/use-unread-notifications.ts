"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getMyNotifications } from "@/server/actions/approval-workflow";
export function useUnreadNotifications(
  userId: string | undefined,
  initialCount?: number,
): number {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount ?? 0);

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
  useEffect(() => {
    function onFocus() {
      getMyNotifications().then((nr) => {
        if (nr.success) setCount(nr.data.filter((n) => !n.readAt).length);
      });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
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