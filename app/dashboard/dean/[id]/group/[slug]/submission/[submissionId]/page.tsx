"use client";
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