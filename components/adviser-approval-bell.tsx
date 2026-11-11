"use client";

// Shared top-right notification bell for adviser pages (dashboard + group
// pages). Thin wrapper around the shared <NotificationBell> so every adviser
// surface shows the same bell, the same unread badge, and the same 5-item
// dropdown. Kept as a separate file so the existing call sites
// (adviserId / routerPush / routeBase) don't need to change.
//
// Previously this dumped the pending-approvals queue with a badge that never
// decremented; now it lists notifications with a badge that drops as items are
// opened.

import NotificationBell from "@/components/notification-bell";
import { type ApprovalNotification } from "@/server/actions/approval-workflow";

type Props = {
  adviserId: string;
  routerPush: (href: string) => void; // injection so we don't need the router hook here
  routeBase: string; // e.g. `/dashboard/adviser/${id}`
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdviserApprovalBell({ routerPush, routeBase }: Props) {
  return (
    <NotificationBell
      routerPush={routerPush}
      allHref={`${routeBase}/notifications`}
      hrefFor={(n: ApprovalNotification) => {
        if (n.submissionId && n.groupName) {
          return `${routeBase}/group/${slugify(n.groupName)}/submission/${n.submissionId}`;
        }
        if (n.groupName) return `${routeBase}/group/${slugify(n.groupName)}`;
        return null;
      }}
    />
  );
}
