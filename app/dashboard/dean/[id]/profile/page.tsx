"use client";

// Notifications are surfaced as the badge beside the user menu (top-right),
// handled inside ProfileSettingsPage — not as a side-nav item.

import { ClipboardList, BarChart3, Inbox, CheckCircle2, FolderOpen } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";

export default function DeanProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  // Same list (and order) as the dean dashboard's own nav: Executive Summary is
  // first for the DEAN only. Every href carries an explicit ?tab= because the
  // dean's default tab is Executive Summary — without it, clicking "Research
  // Analytics" or "TAF Submissions" from here landed on the wrong tab.
  const navItems = [
    { id: "executive-summary", icon: <ClipboardList className="h-5 w-5" />, label: "Executive Summary", href: `/dashboard/dean/${userId}?tab=executive-summary` },
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `/dashboard/dean/${userId}?tab=analytics` },
    { id: "pending", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `/dashboard/dean/${userId}?tab=pending` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `/dashboard/dean/${userId}?tab=approved` },
    { id: "groups", icon: <FolderOpen className="h-5 w-5" />, label: "Advisory Group", href: `/dashboard/dean/${userId}?tab=groups` },
  ];
  return (
    <ProfileSettingsPage role="dean" routeBase="/dashboard/dean" navItems={navItems} />
  );
}
