"use client";

// ============================================================
// /dashboard/dean/[id]/feedback — the Feedback PAGE for the dean account.
//
// Same shape as the associate dean's route (which was the pilot): the department
// console grants `pages.feedback`, the side nav grows the Feedback item, and this
// thin wrapper renders the shared list inside THIS role's chrome
// (components/approver-feedback.tsx owns both).
//
// Without this route the granted item 404'd for a dean account: only
// the associate dean had a /feedback page, so nav-items' APPROVER_PAGE_SEGMENTS
// entry re-pointed the item at a path that did not exist for the other roles.
// ============================================================

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
