"use client";

// ============================================================
// /dashboard/adviser/[id]/feedback — the Feedback PAGE for an adviser.
//
// The department console can grant `pages.feedback` to an ADVISER, and nav-items
// re-points that item at `/dashboard/adviser/<id>/feedback` — but this route did
// not exist (only the dean, associate dean and vcrdes had one), so granting the
// page produced a 404 for the adviser while the nav still showed the item.
//
// Thin wrapper over the shared list, exactly like the other roles: the component
// owns the chrome and the data, this route only supplies role + id.
// ============================================================

import { useParams, useRouter } from "next/navigation";
import ApproverFeedbackPage from "@/components/approver-feedback";

export default function AdviserFeedback() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  return (
    <ApproverFeedbackPage
      role="adviser"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/adviser/${params.id}`)}
    />
  );
}
