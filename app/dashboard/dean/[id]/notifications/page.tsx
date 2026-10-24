'use client'

import { useParams, useRouter } from 'next/navigation'
import ApproverNotificationsPage from '@/components/approver-notifications'

export default function DeanNotifications() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverNotificationsPage
      role="dean"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/dean/${params.id}`)}
    />
  )
}