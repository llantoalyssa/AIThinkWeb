"use client";

import { Users, BookOpen, Star, Bell } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

export default function DepartmentProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const unread = useUnreadNotifications(userId);
  const navItems = [
    { id: "dashboard", icon: <Users className="h-5 w-5" />, label: "Users", href: `/dashboard/department/${userId}` },
    { id: "journals", icon: <BookOpen className="h-5 w-5" />, label: "Journals", href: `/dashboard/department/${userId}` },
    { id: "feedback", icon: <Star className="h-5 w-5" />, label: "Feedback", href: `/dashboard/department/${userId}` },
    { id: "notifications", icon: <Bell className="h-5 w-5" />, label: "Notifications", href: `/dashboard/department/${userId}/notifications`, badge: unread || undefined },
  ];
  return (
    <ProfileSettingsPage role="department" routeBase="/dashboard/department" navItems={navItems} />
  );
}