"use client";
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
          return slug
            ? `${base}/group/${slug}/submission/${n.submissionId}`
            : `${base}/taf`;
        }
        return `${base}/notifications`;
      }}
    />
  );
}