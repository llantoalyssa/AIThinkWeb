-- ============================================================
-- 033: Group-member students can read a submission's analysis
-- ------------------------------------------------------------
-- taf_analysis_results only had SELECT policies for the owning
-- student and the adviser (plus approvers via 021). So a
-- non-submitter student viewing a classmate's submitted TAF within
-- their advisory group got ZERO rows back — the SDG categories,
-- field of IT, gap analysis, and internal/external similarity
-- scores all appeared empty on their view even though the layout
-- renders them. This expands SELECT so any student in the same
-- advisory group as a submission can read its analysis (viewing
-- only; INSERT/UPDATE remain locked to the owner).
-- ============================================================

DROP POLICY IF EXISTS "Group members can view submission analysis" ON public.taf_analysis_results;

CREATE POLICY "Group members can view submission analysis"
ON public.taf_analysis_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    JOIN public.student_group_memberships m
      ON m.group_id = s.group_id
    WHERE s.taf_id = taf_analysis_results.taf_id
      AND m.student_id = auth.uid()
  )
);