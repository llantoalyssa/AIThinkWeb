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