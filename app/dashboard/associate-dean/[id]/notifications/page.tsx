'use client'

import { useParams, useRouter } from 'next/navigation'
import ApproverNotificationsPage from '@/components/approver-notifications'

export default function AssociateDeanNotifications() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  return (
    <ApproverNotificationsPage
      role="associate_dean"
      urlUserId={params.id}
      onBack={() => router.push(`/dashboard/associate-dean/${params.id}`)}
    />
  )
}