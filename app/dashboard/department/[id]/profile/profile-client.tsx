"use client";
import { ProfileSettingsPage, type ProfileNavItem } from "@/components/profile-settings";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { navItemsFor } from "@/components/nav-items";

type Props = {
  userId: string;

  permissions: string[];
};

export default function DepartmentProfileClient({ userId, permissions }: Props) {
  const unread = useUnreadNotifications(userId);
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