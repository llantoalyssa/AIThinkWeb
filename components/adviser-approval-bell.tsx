"use client";
import NotificationBell from "@/components/notification-bell";
import { type ApprovalNotification } from "@/server/actions/approval-workflow";

type Props = {
  adviserId: string;
  routerPush: (href: string) => void;
  routeBase: string;
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