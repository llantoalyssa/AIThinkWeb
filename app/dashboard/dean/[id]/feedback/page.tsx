"use client";
import { useParams, useRouter } from 'next/navigation'
import ApproverFeedbackPage from '@/components/approver-feedback'

export default function DeanFeedback() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverFeedbackPage
      role="dean"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/dean/${params.id}`)}
    />
  )
}