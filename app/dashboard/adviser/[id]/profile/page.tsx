"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { navItemsFor } from "@/components/nav-items";
import { getMyGrantedPermissions } from "@/server/actions/permissions";
import { ProfileSettingsPage, type ProfileNavItem } from "@/components/profile-settings";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

export default function AdviserProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const unread = useUnreadNotifications(userId);
  // Granted pages (Research Analytics / Approved TAF / Journals / Audit Trail)
  // must appear HERE too, not only on the dashboard: every one of the role's
  // pages renders the same nav, and an item that exists on one page and not the
  // next reads as the grant having been lost.
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const keys = await getMyGrantedPermissions();
      if (!cancelled) setPermissions(keys);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // The adviser's items come from the ONE shared source
  // (components/nav-items.tsx) — no local copy here any more.
  // ProfileSettingsPage needs a concrete href, and the unread NOTIFICATIONS
  // badge stays caller-owned wiring keyed on item.id (nav-items carries no
  // counts by design).
  const navItems: ProfileNavItem[] = navItemsFor({ role: "adviser", userId, permissions }).map(
    (item): ProfileNavItem => ({
      id: item.id,
      icon: item.icon,
      label: item.label,
      href: item.href ?? "",
      badge: item.id === "notifications" ? unread || undefined : undefined,
    }),
  );
  return (
    <ProfileSettingsPage role="adviser" routeBase="/dashboard/adviser" navItems={navItems} />
  );
}