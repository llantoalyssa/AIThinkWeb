-- ============================================================
-- 030: Notifications for group joins + realtime memberships
-- ------------------------------------------------------------
-- 1) approval_notifications: submission_id is nullable (a "joined
--    group" notification has no submission) and gains group info +
--    a new 'joined_group' type so clients can navigate to the group.
-- 2) Enable realtime on student_group_memberships so an adviser's
--    open group page reflects a new member as soon as they join.
-- ============================================================

-- ── 1. approval_notifications ─────────────────────────────
ALTER TABLE public.approval_notifications
  ALTER COLUMN submission_id DROP NOT NULL;

-- Relax the type CHECK to allow 'joined_group'
ALTER TABLE public.approval_notifications
  DROP CONSTRAINT IF EXISTS approval_notifications_type_check;

ALTER TABLE public.approval_notifications
  ADD CONSTRAINT approval_notifications_type_check
  CHECK (type IN (
    'routed_to_approver',
    'returned_to_student',
    'resubmitted',
    'fully_approved',
    'joined_group'
  ));

-- Navigation info for non-submission notifications (group joins)
ALTER TABLE public.approval_notifications
  ADD COLUMN IF NOT EXISTS group_id UUID NULL;
ALTER TABLE public.approval_notifications
  ADD COLUMN IF NOT EXISTS group_name TEXT NULL;

-- ── 2. Realtime for group memberships ─────────────────────
ALTER TABLE public.student_group_memberships REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_group_memberships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_group_memberships;
  END IF;
END $$;

-- Diagnostic: should list both tables when run in the SQL Editor.
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE tablename IN ('student_group_memberships', 'submission_annotations')
ORDER BY tablename;