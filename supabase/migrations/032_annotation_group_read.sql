-- ============================================================
-- 032: Group-member students can READ annotations (read-only)
-- ------------------------------------------------------------
-- Splits the annotation policies: any student in the joined
-- advisory group may READ the comment threads (view-only), but
-- only participants (submitter / adviser / routed approvers) may
-- insert/update. The server action additionally returns a
-- `canComment` flag so the UI hides the composer for viewers.
-- ============================================================

-- Participants (submitter, adviser, routed approvers) read.
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

-- VIEW-ONLY: any student in the joined advisory group can read
-- the comment threads (not just the submitter). This is strictly
-- a READ policy — the user still cannot insert/update, so they
-- can see comments but not add/reply/resolve/edit them.
DROP POLICY IF EXISTS "Annotations readable by group members" ON public.submission_annotations;
CREATE POLICY "Annotations readable by group members"
ON public.submission_annotations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.id = submission_annotations.submission_id
      AND s.group_id IN (
        SELECT m.group_id
        FROM public.student_group_memberships m
        WHERE m.student_id = auth.uid()
      )
  )
);