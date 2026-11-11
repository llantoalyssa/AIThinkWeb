"use client";
import { useParams, useRouter } from 'next/navigation'
import ApproverFeedbackPage from '@/components/approver-feedback'

export default function VCRDESFeedback() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverFeedbackPage
      role="vcrdes"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/vcrdes/${params.id}`)}
    />
  )
}