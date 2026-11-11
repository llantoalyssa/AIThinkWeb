"use client";

// ============================================================
// Department — a TAF opened from the department's TAF Submissions list.
//
// Thin wrapper over the shared approver submission view, exactly like the dean
// / vcrdes / associate-dean pages: the wrapper supplies the role, the view
// supplies the chrome (its side nav comes from the department's OWN list —
// departmentNav via approverNavItemsFor — plus the bell and user menu) and the
// Approve / Return actions.
//
// The DEPARTMENT is the OPTIONAL approver: it has no step of its own, so the
// shared view lets it decide ANY pending step (see isRoutedToMe there). Both
// the Back button and the redirect after a decision therefore return to the
// department's TAF list — ?section=submissions — instead of an approver
// ?tab=pending URL, which means nothing to this role.
// ============================================================

import { useParams, useSearchParams } from "next/navigation";
import ApproverSubmissionView from "@/components/approver-submission-view";

export default function DepartmentSubmissionPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // Rows on the Approved TAF page carry ?from=approved-page (the Approved TAB of
  // TAF Submissions uses the plain ?from=approved). Back follows the origin
  // instead of always claiming "Back to TAF Submissions".
  const fromApprovedPage = searchParams.get("from") === "approved-page";

  return (
    <ApproverSubmissionView
      role="department"
      backHref={
        fromApprovedPage
          ? `/dashboard/department/${params.id}/approved`
          : `/dashboard/department/${params.id}?section=submissions`
      }
      backLabel={
        fromApprovedPage ? "Back to Approved TAFs" : "Back to TAF Submissions"
      }
    />
  );
}
