-- 044: Let recipients mark their OWN notifications as read.
--
-- WHY THIS IS NEEDED (badge not decrementing, ALL roles):
--   markNotificationsRead() / markAllNotificationsRead() run as the logged-in
--   user and issue .update({ read_at }) against approval_notifications. With
--   Row Level Security enabled, an UPDATE with no matching policy silently
--   updates ZERO rows (no error is raised). The UI optimistically shows the
--   notification as read, but the change never persists — so when the user
--   navigates back to their dashboard and the page re-fetches, the rows are
--   still unread and the badge never drops.
--
--   Migration 012 created only SELECT + INSERT policies, which is why mark-read
--   never stuck for students, advisers or approvers.

ALTER TABLE public.approval_notifications ENABLE ROW LEVEL SECURITY;

-- A user may mark their OWN notifications as read. USING covers the row being
-- updated (must belong to them); WITH CHECK prevents reassigning a
-- notification to another user_id.
DROP POLICY IF EXISTS "Users update their own notifications"
  ON public.approval_notifications;
CREATE POLICY "Users update their own notifications"
  ON public.approval_notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());