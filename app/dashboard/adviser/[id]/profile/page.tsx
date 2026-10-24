"use client";

import { BarChart3, Bell } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

export default function AdviserProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const unread = useUnreadNotifications(userId);
  const navItems = [
    { id: "dashboard", icon: <BarChart3 className="h-5 w-5" />, label: "Dashboard", href: `/dashboard/adviser/${userId}` },
    { id: "notifications", icon: <Bell className="h-5 w-5" />, label: "Notifications", href: `/dashboard/adviser/${userId}/notifications`, badge: unread || undefined },
  ];
  return (
    <ProfileSettingsPage role="adviser" routeBase="/dashboard/adviser" navItems={navItems} />
  );
}