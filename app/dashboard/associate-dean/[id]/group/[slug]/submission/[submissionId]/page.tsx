"use client";

// ============================================================
// Associate dean — a TAF opened from inside one of the associate dean's OWN
// advisory groups. Mirrors the dean's group-scoped route so "Back" returns to
// the selected group rather than the TAF Submissions tab.
// ============================================================

import { useParams } from "next/navigation";
import ApproverSubmissionView from "@/components/approver-submission-view";

export default function AssociateDeanGroupSubmissionPage() {
  const params = useParams<{ id: string; slug: string }>();

  return (
    <ApproverSubmissionView
      role="associate_dean"
      backHref={`/dashboard/associate-dean/${params.id}/groups/${params.slug}`}
      backLabel="Back to group"
    />
  );
}
