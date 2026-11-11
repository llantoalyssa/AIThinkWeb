"use client";

// ============================================================
// StudentNotificationsBell — the student header bell, with the student's own
// destination rules, so every student page renders the SAME bell.
//
// It exists because the bell was repeated (and drifted) per page: the header on
// the dashboard sent a "fully approved" notification to the Topic Abstract Form
// LIST instead of the submission the notification is about, while the
// notifications page — which resolves destinations its own way — opened it
// correctly. One wrapper = one set of rules.
//
// Destination rules:
//   • a submission notification → that submission, inside its advisory group
//     (the route needs the group slug; the notification carries `group_name`)
//   • anything else              → the student's notifications page
// ============================================================

import { useRouter } from "next/navigation";
import NotificationBell from "@/components/notification-bell";
import type { ApprovalNotification } from "@/server/actions/approval-workflow";
import { groupSlug } from "@/lib/slug";

export default function StudentNotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const base = `/dashboard/student/${userId}`;

  return (
    <NotificationBell
      routerPush={(href) => router.push(href)}
      allHref={`${base}/notifications`}
      hrefFor={(n: ApprovalNotification) => {
        if (n.submissionId) {
          const slug = n.groupName ? groupSlug(n.groupName) : "";
          // Without a group name there is no submission route to build — fall
          // back to the TAF page rather than a dead link.
          return slug
            ? `${base}/group/${slug}/submission/${n.submissionId}`
            : `${base}/taf`;
        }
        return `${base}/notifications`;
      }}
    />
  );
}
