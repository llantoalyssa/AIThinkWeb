"use client";
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