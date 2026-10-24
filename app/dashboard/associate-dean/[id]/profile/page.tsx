"use client";

// Notifications are surfaced as the badge beside the user menu (top-right),
// handled inside ProfileSettingsPage — not as a side-nav item.

import { BarChart3, Inbox, CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";

export default function AssociateDeanProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  // Every href carries an explicit ?tab= — a bare dashboard URL lands on the
  // role's default tab, so "TAF Submissions" / "Approved TAF" used to open the
  // wrong tab from this page.
  const navItems = [
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `/dashboard/associate-dean/${userId}?tab=analytics` },
    { id: "pending", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `/dashboard/associate-dean/${userId}?tab=pending` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `/dashboard/associate-dean/${userId}?tab=approved` },
  ];
  return (
    <ProfileSettingsPage role="associate_dean" routeBase="/dashboard/associate-dean" navItems={navItems} />
  );
}
