"use client";



import { ProfileSettingsPage, type ProfileNavItem } from "@/components/profile-settings";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { navItemsFor } from "@/components/nav-items";

type Props = {
  userId: string;
  /** EFFECTIVE permission keys — filters the nav item-by-item. */
  permissions: string[];
};

export default function DepartmentProfileClient({ userId, permissions }: Props) {
  const unread = useUnreadNotifications(userId);

  // ProfileNavItem requires a concrete href; every department item has one
  // (the fallback is only a type-level guard).
  const navItems: ProfileNavItem[] = navItemsFor({
    role: "department",
    userId,
    permissions,
  }).map((item) => ({
    id: item.id,
    icon: item.icon,
    label: item.label,
    href: item.href ?? `/dashboard/department/${userId}`,
    badge: item.id === "notifications" ? unread || undefined : undefined,
  }));

  return (
    <ProfileSettingsPage role="department" routeBase="/dashboard/department" navItems={navItems} />
  );
}
