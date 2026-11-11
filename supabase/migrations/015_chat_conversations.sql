-- ============================================================
-- 015: Per-counterparty chat conversations
-- ------------------------------------------------------------
-- The submission chat was a single joined thread shared by the
-- student, adviser, associate dean, dean, and vcrdes. This makes
-- each message belong to a specific conversation between the
-- student and ONE counterparty (adviser | associate_dean | dean
-- | vcrdes), so the student can choose who to talk to and each
-- approver only sees their own thread.
-- ============================================================

ALTER TABLE public.submission_chat_messages
  ADD COLUMN IF NOT EXISTS with_role TEXT NOT NULL DEFAULT 'adviser'
  CHECK (with_role IN ('adviser', 'associate_dean', 'dean', 'vcrdes'));

-- Existing messages were in the student↔adviser thread.
UPDATE public.submission_chat_messages
SET with_role = 'adviser'
WHERE with_role IS NULL;

CREATE INDEX IF NOT EXISTS idx_submission_chat_with_role
  ON public.submission_chat_messages(submission_id, with_role, created_at);
