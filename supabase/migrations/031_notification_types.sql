-- ============================================================
-- 031: Notification types for submissions + comments
-- ------------------------------------------------------------
-- Extends approval_notifications so the adviser is notified when a
-- student submits a TAF and when a comment/annotation is added.
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
    'taf_submitted',
    'new_comment'
  ));