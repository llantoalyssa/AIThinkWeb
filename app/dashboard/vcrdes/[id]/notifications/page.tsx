'use client'

import { useParams, useRouter } from 'next/navigation'
import ApproverNotificationsPage from '@/components/approver-notifications'

export default function VcrdesNotifications() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverNotificationsPage
      role="vcrdes"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/vcrdes/${params.id}`)}
    />
  )
}