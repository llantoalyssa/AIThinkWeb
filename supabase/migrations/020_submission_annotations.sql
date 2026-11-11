-- ============================================================
-- 020: Submission annotations (Google-Docs-style commenting)
-- ------------------------------------------------------------
-- Replaces the free-text submission chat with snippet-anchored
-- comment threads. Each annotation attaches to a section
-- (field_key) of the submitted TAF and a highlighted text
-- snippet. Threads are grouped via parent_id (parent = thread
-- root, replies link to it). `with_role` preserves the
-- per-counterparty visibility rule: the student submits,
-- the adviser comments from the start, and downstream approvers
-- (associate_dean / dean / vcrdes) can only see/comment once
-- the TAF has been routed to them — the same roadmap enforced
-- by the approval workflow (and by the server actions).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submission_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which submission this annotation belongs to
  submission_id UUID NOT NULL REFERENCES public.group_taf_submissions(id)
    ON DELETE CASCADE,

  -- Which TAF section the comment is anchored to
  -- (proposedTitle | background | objectives | literatureReview |
  --  methodology | referenceList)
  field_key TEXT NOT NULL,

  -- The exact highlighted text snippet (for re-highlighting)
  text_snippet TEXT NOT NULL DEFAULT '',

  -- The visible comment thread the reply belongs to.
  -- NULL = this is a new thread root; non-NULL = a reply to that root.
  parent_id UUID NULL REFERENCES public.submission_annotations(id)
    ON DELETE CASCADE,

  -- Which counterparty this annotation's thread is visible to
  -- (adviser | associate_dean | dean | vcrdes). Student sees all.
  with_role TEXT NOT NULL DEFAULT 'adviser'
    CHECK (with_role IN ('adviser', 'associate_dean', 'dean', 'vcrdes')),

  -- Author
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL,

  -- Content
  comment TEXT NOT NULL CHECK (char_length(comment) <= 2000),
  resolved_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotations_submission
  ON public.submission_annotations(submission_id, with_role, created_at);
CREATE INDEX IF NOT EXISTS idx_annotations_parent
  ON public.submission_annotations(parent_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.submission_annotations ENABLE ROW LEVEL SECURITY;

-- Participants (student submitters, advisers, and routed approvers) can
-- read annotations. Coarse like the chat policy — precise routing-gating
-- is also enforced in the server actions.
DROP POLICY IF EXISTS "Annotations visible to participants" ON public.submission_annotations;
CREATE POLICY "Annotations visible to participants"
ON public.submission_annotations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.id = submission_annotations.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.group_id IN (
          SELECT g.id FROM public.advisory_groups g
          WHERE g.adviser_id = auth.uid()
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('associate_dean', 'dean', 'vcrdes')
          )
          AND (
            s.current_approver_role = (
              SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
            )
            OR s.fully_approved_at IS NOT NULL
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Annotations creatable by participants" ON public.submission_annotations;
CREATE POLICY "Annotations creatable by participants"
ON public.submission_annotations
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.id = submission_annotations.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.group_id IN (
          SELECT g.id FROM public.advisory_groups g
          WHERE g.adviser_id = auth.uid()
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('associate_dean', 'dean', 'vcrdes')
          )
          AND (
            s.current_approver_role = (
              SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
            )
            OR s.fully_approved_at IS NOT NULL
          )
        )
      )
  )
);

-- The thread AUTHOR can update their own rows (e.g. toggle resolved_at).
-- Required for the Resolve/Reopen buttons to work.
DROP POLICY IF EXISTS "Annotations updatable by author" ON public.submission_annotations;
CREATE POLICY "Annotations updatable by author"
ON public.submission_annotations
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_annotations_updated_at ON public.submission_annotations;
CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON public.submission_annotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();