"use client";
import { BarChart3, Inbox, CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ProfileSettingsPage } from "@/components/profile-settings";

export default function VcrdesProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const navItems = [
    { id: "analytics", icon: <BarChart3 className="h-5 w-5" />, label: "Research Analytics", href: `/dashboard/vcrdes/${userId}?tab=analytics` },
    { id: "pending", icon: <Inbox className="h-5 w-5" />, label: "TAF Submissions", href: `/dashboard/vcrdes/${userId}?tab=pending` },
    { id: "approved", icon: <CheckCircle2 className="h-5 w-5" />, label: "Approved TAF", href: `/dashboard/vcrdes/${userId}?tab=approved` },
  ];
  return (
    <ProfileSettingsPage role="vcrdes" routeBase="/dashboard/vcrdes" navItems={navItems} />
  );
}