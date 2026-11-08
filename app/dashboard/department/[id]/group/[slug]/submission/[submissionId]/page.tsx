"use client";



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
