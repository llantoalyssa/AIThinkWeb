"use client";

// ============================================================
// Department — a TAF opened from inside one of the department's OWN advisory
// groups. Mirrors the associate dean's group-scoped route, so "Back" returns to
// the selected group rather than the TAF Submissions section.
//
// The shared group-detail screen links submissions here (…/group/<slug>/
// submission/<id>) and the header bell deep-links to the same shape, so this
// route is what keeps those two links from 404ing for the department.
// ============================================================

import { useParams } from "next/navigation";
import ApproverSubmissionView from "@/components/approver-submission-view";

export default function DepartmentGroupSubmissionPage() {
  const params = useParams<{ id: string; slug: string }>();

  return (
    <ApproverSubmissionView
      role="department"
      backHref={`/dashboard/department/${params.id}/groups/${params.slug}`}
      backLabel="Back to group"
    />
  );
}
