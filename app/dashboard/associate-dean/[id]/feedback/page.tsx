'use client'

// ============================================================
// /dashboard/associate-dean/[id]/feedback — the Feedback PAGE for the associate
// dean, i.e. the pilot for the "page permission" feature: an account the
// department console granted `pages.feedback` can open this route (and sees the
// Feedback item in its side nav).
//
// Thin on purpose: the chrome (header + permission-aware approver side nav) and
// the shared feedback list live in components/approver-feedback.tsx, exactly the
// way the notifications route delegates to ApproverNotificationsPage.
//
// ── REPLICATING THIS FOR ANOTHER ROLE OR ANOTHER PAGE ──────────────────────
// (i)   A ROUTE for that role — e.g. app/dashboard/<role>/[id]/feedback/page.tsx
//       (this file). The page must render inside THAT role's chrome, not the
//       department's.
// (ii)  PASS THE PERMISSION SET INTO navItemsFor(). nav-items.tsx appends a
//       granted "pages.<id>" item only when it is given the caller's effective
//       permissions, so the caller must fetch them (getGrantedPermissions /
//       getUserPermissionState in server/actions/permissions.ts) and pass them
//       through approverNavItemsFor() (components/approver-sidebar.tsx), which
//       re-points the appended item at this role's own route. The granted page
//       id must also have an entry in that module's APPROVER_PAGE_SEGMENTS.
// (iii) THE MATCHING RLS POLICY — the page's data must be readable by the new
//       grant. For feedback that is migration 056's SELECT policy on
//       public.system_feedback, which tests public.has_permission(uid,
//       'pages.feedback'); the server guard in server/actions/feedback.ts
//       tests the same key, so the two cannot disagree.
//
// Also required: the permission key itself must exist in the catalogue
// (supabase/migrations/053_user_permissions.sql) and be tickable in the
// department console — no code change invents a permission.
// ============================================================

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
