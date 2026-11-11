-- ============================================================
-- 021: Approvers can read TAF analysis results
-- ------------------------------------------------------------
-- taf_analysis_results only had SELECT policies for students and
-- advisers, so approvers (associate_dean / dean / vcrdes) got ZERO
-- rows back when opening a routed submission — leaving the TAF's
-- classification, field of IT, gap analysis, and internal/external
-- matches empty on their review page even though the layout renders
-- them. This adds an approver SELECT policy mirroring the exact
-- routing gate used on group_taf_submissions: an approver may read
-- the analysis of a submission that has been routed to them (or is
-- fully approved).
-- ============================================================

DROP POLICY IF EXISTS "Approvers can view routed TAF analysis" ON public.taf_analysis_results;

CREATE POLICY "Approvers can view routed TAF analysis"
ON public.taf_analysis_results
FOR SELECT
USING (
  -- Only approver roles apply here
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('associate_dean', 'dean', 'vcrdes')
  )
  -- The TAF's submission has been routed to them, or fully approved
  AND EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.taf_id = taf_analysis_results.taf_id
      AND (
        s.current_approver_role = (
          SELECT r.role FROM public.profiles r WHERE r.id = auth.uid()
        )
        OR s.fully_approved_at IS NOT NULL
      )
  )
);