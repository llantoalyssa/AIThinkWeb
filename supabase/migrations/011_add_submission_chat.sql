-- ============================================================
-- 011: Submission chat messages
-- ------------------------------------------------------------
-- One-on-one conversation between the student who submitted a
-- TAF and the adviser who owns the advisory group. Messages are
-- scoped per submission, so the chat exists only after a TAF is
-- submitted and only between those two parties.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submission_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.group_taf_submissions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(btrim(message)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ  -- set when the other party has seen the thread
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_submission_chat_submission_id
  ON public.submission_chat_messages(submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submission_chat_sender_id
  ON public.submission_chat_messages(sender_id);

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE public.submission_chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- Only two parties can access a submission's chat:
--   • the student who submitted the TAF (submitted_by)
--   • the adviser who owns the group (advisory_groups.adviser_id)
-- ============================================================

DROP POLICY IF EXISTS "Chat visible to student or adviser" ON public.submission_chat_messages;
CREATE POLICY "Chat visible to student or adviser"
ON public.submission_chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.id = submission_chat_messages.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.group_id IN (
          SELECT g.id FROM public.advisory_groups g
          WHERE g.adviser_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Chat sendable by student or adviser" ON public.submission_chat_messages;
CREATE POLICY "Chat sendable by student or adviser"
ON public.submission_chat_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.id = submission_chat_messages.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.group_id IN (
          SELECT g.id FROM public.advisory_groups g
          WHERE g.adviser_id = auth.uid()
        )
      )
  )
);
