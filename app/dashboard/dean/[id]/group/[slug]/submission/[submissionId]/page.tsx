"use client";

// ============================================================
// Dean — a TAF opened from inside one of the dean's OWN advisory groups.
//
// Same route shape the adviser has (.../group/<slug>/submission/<id>) so the
// group context is preserved: "Back" returns to that group, not to the TAF
// Submissions tab. Thin wrapper over the shared approver submission view,
// which supplies the dean's nav/bell/chrome.
// ============================================================

import { useParams } from "next/navigation";
import ApproverSubmissionView from "@/components/approver-submission-view";

export default function DeanGroupSubmissionPage() {
  const params = useParams<{ id: string; slug: string }>();

  return (
    <ApproverSubmissionView
      role="dean"
      backHref={`/dashboard/dean/${params.id}/groups/${params.slug}`}
      backLabel="Back to group"
    />
  );
}
