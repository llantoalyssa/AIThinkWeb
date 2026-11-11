-- ============================================================
-- Migration 043 — advisers can remove a student from their group
--
-- TWO things were missing:
--
-- 1) RLS. Migration 001 DROPs a policy named
--    "Advisers can remove students from their groups" but never creates it —
--    only "Students can leave groups" (delete their own row) exists. So an
--    adviser's DELETE on student_group_memberships matched ZERO rows and
--    silently did nothing (the classic RLS no-op). This adds the policy back:
--    an adviser may delete membership rows for groups they own.
--
-- 2) Notification type. approval_notifications.type has a CHECK constraint
--    (last redefined in 037) that doesn't include the new
--    'removed_from_group' value, so the student-facing notification would be
--    rejected. Extend the constraint.
--
-- NOTE: only the MEMBERSHIP row is removed. Submitted TAFs live in
-- group_taf_submissions keyed by (group_id, submitted_by) — they are NOT
-- touched, so the adviser keeps the submission and its approval trail.
-- ============================================================

-- ── 1. Adviser DELETE policy on memberships ─────────────────
DROP POLICY IF EXISTS "Advisers can remove students from their groups"
  ON public.student_group_memberships;

CREATE POLICY "Advisers can remove students from their groups"
ON public.student_group_memberships
FOR DELETE
USING (
  group_id IN (
    SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
  )
);

-- ── 2. Allow the 'removed_from_group' notification type ─────
ALTER TABLE public.approval_notifications
  DROP CONSTRAINT IF EXISTS approval_notifications_type_check;

ALTER TABLE public.approval_notifications
  ADD CONSTRAINT approval_notifications_type_check
  CHECK (type IN (
    'routed_to_approver',
    'returned_to_student',
    'resubmitted',
    'fully_approved',
    'joined_group',
    'left_group',
    'removed_from_group',
    'taf_submitted',
    'new_comment'
  ));
