"use client";

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
