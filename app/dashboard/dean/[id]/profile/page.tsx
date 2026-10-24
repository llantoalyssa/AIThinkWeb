"use client";
import { ClipboardList, BarChart3, Inbox, CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";

export default function DeanProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const navItems = [
    { id: "executive-summary", icon: <ClipboardList className="h-5 w-5" />, label: "Executive Summary", href: `/dashboard/dean/${userId}?tab=executive-summary` },
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `/dashboard/dean/${userId}?tab=analytics` },
    { id: "pending", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `/dashboard/dean/${userId}?tab=pending` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `/dashboard/dean/${userId}?tab=approved` },
  ];
  return (
    <ProfileSettingsPage role="dean" routeBase="/dashboard/dean" navItems={navItems} />
  );
}