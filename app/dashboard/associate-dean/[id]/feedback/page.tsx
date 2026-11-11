'use client'
import { useParams, useRouter } from 'next/navigation'
import ApproverFeedbackPage from '@/components/approver-feedback'

export default function AssociateDeanFeedback() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverFeedbackPage
      role="associate_dean"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/associate-dean/${params.id}`)}
    />
  )
}