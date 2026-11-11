-- ============================================================
-- 036: Approvers can read TAF rows for research analytics
-- ------------------------------------------------------------
-- topic_abstract_forms only had SELECT policies for the owning
-- student and the adviser. The Associate Dean / Dean / VCRDES
-- research analytics dashboard needs the TAF titles of FULLY
-- APPROVED submissions (to label the capstone / SDG / similarity
-- tables). This adds an approver SELECT policy keyed on the
-- fully-approved submissions gate (same pattern as 021), so an
-- approver may read a TAF's metadata only once its submission is
-- fully approved.
-- ============================================================

DROP POLICY IF EXISTS "Approvers can read approved TAFs" ON public.topic_abstract_forms;

CREATE POLICY "Approvers can read approved TAFs"
ON public.topic_abstract_forms
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('associate_dean', 'dean', 'vcrdes')
  )
  AND EXISTS (
    SELECT 1
    FROM public.group_taf_submissions s
    WHERE s.taf_id = topic_abstract_forms.id
      AND s.fully_approved_at IS NOT NULL
  )
);