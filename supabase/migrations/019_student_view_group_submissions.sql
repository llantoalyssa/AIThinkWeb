-- ============================================================
-- 019: Students can view all submissions within their group
-- ------------------------------------------------------------
-- Previously a student could only SELECT submissions they
-- submitted themselves. Group members should be able to view
-- every submitted TAF in the advisory group they belong to
-- (so they can see classmates' proposals and the approval flow).
-- ============================================================

DROP POLICY IF EXISTS "Students can view own submissions" ON public.group_taf_submissions;

-- Students can view any submission in a group they belong to
-- (including their own, since they're a member of the group).
CREATE POLICY "Students can view group submissions"
ON public.group_taf_submissions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.student_group_memberships
        WHERE student_id = auth.uid()
        AND group_id = group_taf_submissions.group_id
    )
);