"use client";



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
