-- ============================================================
-- Migration 042 — discard a cancelled analysis run (rollback)
--
-- PROBLEM: the Analyze button's "Cancel" only stops the UI. The server
-- action (analyzeTAF) keeps running to completion and PERSISTS its result:
-- it inserts a row into taf_analysis_results, sets the TAF status to
-- 'analyzed', and overwrites the student's fields with the AI enhancement.
-- So after cancelling, the analysis "output" still appears (on reload, or
-- when the TAF is reopened) — as if the cancel did nothing.
--
-- FIX: a SECURITY DEFINER RPC the client calls right after a cancelled run
-- finishes, to undo it:
--   1. delete that analysis version (only the LATEST one, only if it
--      belongs to the caller's own TAF),
--   2. restore the TAF's fields from the snapshot stored with the version
--      (the snapshot is the student's ORIGINAL text, pre-enhancement),
--   3. set the TAF status back to 'analyzed' if earlier versions remain,
--      otherwise back to 'draft'.
--
-- Deleting a version that is NOT the latest is refused, so the version
-- history can never be reordered by a stale/duplicate cancel call.
-- ============================================================

CREATE OR REPLACE FUNCTION public.discard_taf_analysis(
  p_taf_id UUID,
  p_version_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_latest INT;
  v_snapshot JSONB;
  v_remaining INT;
  v_status TEXT;
BEGIN
  -- Ownership check — only the TAF's own student may discard a run.
  SELECT student_id INTO v_owner
  FROM public.topic_abstract_forms
  WHERE id = p_taf_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TAF not found.');
  END IF;
  IF v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can only discard your own analyses.');
  END IF;

  -- Only the latest version may be discarded.
  SELECT MAX(version_number) INTO v_latest
  FROM public.taf_analysis_results
  WHERE taf_id = p_taf_id;

  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No analysis found to discard.');
  END IF;
  IF v_latest <> p_version_number THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the latest analysis can be discarded.');
  END IF;

  -- Grab the pre-enhancement snapshot so the student's own text can be restored.
  SELECT form_fields_snapshot INTO v_snapshot
  FROM public.taf_analysis_results
  WHERE taf_id = p_taf_id AND version_number = p_version_number;

  DELETE FROM public.taf_analysis_results
  WHERE taf_id = p_taf_id AND version_number = p_version_number;

  -- Restore the student's original fields (undo the AI enhancement).
  IF v_snapshot IS NOT NULL THEN
    UPDATE public.topic_abstract_forms
    SET proposed_title   = COALESCE(NULLIF(v_snapshot->>'proposedTitle', ''), proposed_title),
        background       = COALESCE(NULLIF(v_snapshot->>'background', ''), background),
        objectives       = COALESCE(NULLIF(v_snapshot->>'objectives', ''), objectives),
        literature_review= COALESCE(NULLIF(v_snapshot->>'literatureReview', ''), literature_review),
        methodology      = COALESCE(NULLIF(v_snapshot->>'methodology', ''), methodology),
        reference_list   = COALESCE(NULLIF(v_snapshot->>'referenceList', ''), reference_list)
    WHERE id = p_taf_id;
  END IF;

  -- Status follows what remains: earlier versions → still analyzed, none → draft.
  SELECT COUNT(*) INTO v_remaining
  FROM public.taf_analysis_results
  WHERE taf_id = p_taf_id;

  v_status := CASE WHEN v_remaining > 0 THEN 'analyzed' ELSE 'draft' END;

  UPDATE public.topic_abstract_forms
  SET status = v_status
  WHERE id = p_taf_id;

  RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_taf_analysis(UUID, INT) TO authenticated;
