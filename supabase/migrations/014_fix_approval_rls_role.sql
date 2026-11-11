-- ============================================================
-- 014: Fix approval RLS policies (role resolution)
-- ------------------------------------------------------------
-- The policies from 013 used `auth.jwt() ->> 'role'`, but Supabase
-- JWTs always carry role='authenticated' (the Postgres role), NOT
-- the application role stored in profiles.role. So approver policies
-- never matched and approvers saw zero rows.
--
-- This migration drops and recreates those policies resolving the
-- app role via the profiles table instead.
-- ============================================================

-- ── 1. Approver roles: SELECT ─────────────────────────────
DROP POLICY IF EXISTS "Approvers can view routed submissions" ON public.group_taf_submissions;
CREATE POLICY "Approvers can view routed submissions"
ON public.group_taf_submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('associate_dean', 'dean', 'vcrdes')
  )
  AND (
    current_approver_role = (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR fully_approved_at IS NOT NULL
  )
);

-- ── 2. Approver roles: UPDATE (approve / return) ──────────
DROP POLICY IF EXISTS "Approvers can update routed submissions" ON public.group_taf_submissions;
CREATE POLICY "Approvers can update routed submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (
  current_approver_role = (
    SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
  )
)
WITH CHECK (true);

-- ── 3. Chat: approver participants ────────────────────────
-- Same role-resolution fix for the chat policies added in 013.
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

-- ── 4. Approved list: approver access (role via profiles) ─
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
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('associate_dean', 'dean', 'vcrdes')
    )
  )
);
