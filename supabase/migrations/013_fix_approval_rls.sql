-- ============================================================
-- 013: Fix RLS for the approval workflow
-- ------------------------------------------------------------
-- group_taf_submissions originally only had policies for the
-- student (submitter) and the group adviser. The approval chain
-- (associate_dean → dean → vcrdes) needs:
--   • SELECT  — view submissions routed to them (or fully approved)
--   • UPDATE  — record approve/return decisions
-- The adviser also needs UPDATE (approve/return), and the student
-- needs UPDATE (resubmit after revision).
-- ============================================================

-- ── 1. Approver roles: SELECT ─────────────────────────────
-- Visible once routed to them (current_approver_role = their role)
-- OR the submission is fully approved.
DROP POLICY IF EXISTS "Approvers can view routed submissions" ON public.group_taf_submissions;
CREATE POLICY "Approvers can view routed submissions"
ON public.group_taf_submissions
FOR SELECT
USING (
  auth.jwt() ->> 'role' IN ('associate_dean', 'dean', 'vcrdes')
  AND (
    current_approver_role = (auth.jwt() ->> 'role')
    OR fully_approved_at IS NOT NULL
  )
);

-- ── 2. Approver roles: UPDATE (approve / return) ──────────
-- USING gates on the OLD row (currently routed to me). WITH CHECK
-- must accept the NEW state, which may be the next approver, NULL
-- (fully approved), or 'revisions_needed' (returned) — so allow it.
DROP POLICY IF EXISTS "Approvers can update routed submissions" ON public.group_taf_submissions;
CREATE POLICY "Approvers can update routed submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (current_approver_role = (auth.jwt() ->> 'role'))
WITH CHECK (true);

-- ── 3. Adviser: UPDATE (approve / return / route) ─────────
DROP POLICY IF EXISTS "Advisers can update group submissions" ON public.group_taf_submissions;
CREATE POLICY "Advisers can update group submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (
  group_id IN (
    SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
  )
)
WITH CHECK (
  group_id IN (
    SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
  )
);

-- ── 4. Student: UPDATE (resubmit after revision) ──────────
DROP POLICY IF EXISTS "Students can update own submissions" ON public.group_taf_submissions;
CREATE POLICY "Students can update own submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (submitted_by = auth.uid())
WITH CHECK (submitted_by = auth.uid());

-- ── 5. All participants: SELECT on fully approved rows ────
-- (so students/advisers/approvers can browse the Approved list)
DROP POLICY IF EXISTS "Approved submissions visible to participants" ON public.group_taf_submissions;
CREATE POLICY "Approved submissions visible to participants"
ON public.group_taf_submissions
FOR SELECT
USING (
  fully_approved_at IS NOT NULL
  AND (
    submitted_by = auth.uid()
    OR group_id IN (
      SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' IN ('associate_dean', 'dean', 'vcrdes')
  )
);

-- ── 6. Chat: approvers can read/send once routed ──────────
-- The chat policies in migration 011 only covered student + adviser.
-- Extend them so approver roles can join the conversation for
-- submissions that are routed to them (or already decided).
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
        OR (
          auth.jwt() ->> 'role' IN ('associate_dean', 'dean', 'vcrdes')
          AND (
            s.current_approver_role = (auth.jwt() ->> 'role')
            OR s.fully_approved_at IS NOT NULL
          )
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
        OR (
          auth.jwt() ->> 'role' IN ('associate_dean', 'dean', 'vcrdes')
          AND (
            s.current_approver_role = (auth.jwt() ->> 'role')
            OR s.fully_approved_at IS NOT NULL
          )
        )
      )
  )
);
