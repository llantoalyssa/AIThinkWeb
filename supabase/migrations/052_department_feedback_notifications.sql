-- ============================================================
-- 052: department feedback notifications
--
-- The department role's notification list is fed by USER FEEDBACK (it is not
-- in the approval chain, so it receives no routed TAFs). Two things block that
-- today:
--   1. approval_notifications.submission_id is NOT NULL — a feedback event has
--      no submission, so the insert would fail.
--   2. the type CHECK constraint (last set by 037) has no feedback type.
--
-- Both are fixed here; the allowed-type list keeps every existing value so no
-- existing notification is invalidated.
-- ============================================================

ALTER TABLE public.approval_notifications
  ALTER COLUMN submission_id DROP NOT NULL;

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
    'taf_submitted',
    'new_comment',
    -- department: a user posted system feedback
    'new_feedback'
  ));
