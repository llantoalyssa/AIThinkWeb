-- ============================================================
-- Migration 040 — fix TAF draft deletion (analyzed TAFs no-op bug)
--
-- PROBLEM: the "Students can delete own draft TAFs" policy only allowed
-- deleting rows whose status = 'draft'. But the app lets students delete
-- BOTH 'draft' and 'analyzed' TAFs (deleteTopicAbstract uses
-- status IN ('draft','analyzed')). For an 'analyzed' TAF, RLS filtered the
-- DELETE down to zero rows WITHOUT raising an error, so the app reported
-- "Draft deleted." and removed the card, but nothing was actually removed —
-- the TAF reappeared on reload.
--
-- FIX: allow deleting own TAFs that are 'draft' OR 'analyzed'. Deletion of
-- anything that was ever submitted is still blocked server-side
-- (deleteTopicAbstract checks group_taf_submissions) so the approval trail
-- stays intact.
-- ============================================================

DROP POLICY IF EXISTS "Students can delete own draft TAFs" ON public.topic_abstract_forms;

CREATE POLICY "Students can delete own draft TAFs"
ON public.topic_abstract_forms
FOR DELETE
USING (
  student_id = auth.uid()
  AND status IN ('draft', 'analyzed')
);