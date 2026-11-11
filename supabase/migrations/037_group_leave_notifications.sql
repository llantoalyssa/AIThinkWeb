-- ============================================================
-- 037: Group-leave notifications
-- ------------------------------------------------------------
-- Add a 'left_group' type to approval_notifications so the
-- adviser is notified when a student leaves their advisory group
-- (mirrors the existing 'joined_group' type).
-- ============================================================

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
    'new_comment'
  ));