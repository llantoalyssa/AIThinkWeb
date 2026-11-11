-- ============================================================
-- 025: Student "Unsubmit TAF" (SECURITY DEFINER delete)
-- ------------------------------------------------------------
-- Lets the submitting student withdraw their TAF from the approval
-- flow, deleting the group_taf_submissions row entirely (so it is
-- removed from approver queues and the TAF goes back to "available
-- to submit"). group_taf_submissions has no DELETE RLS policy, and
-- a plain client delete would be blocked — so this runs with owner
-- privileges. Authorization (must be the submitter, not fully
-- approved) is enforced BOTH in the server action and here.
-- ============================================================

CREATE OR REPLACE FUNCTION public.unsubmit_taf_submission(
  p_submission_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submitter uuid;
  v_status    text;
BEGIN
  SELECT submitted_by, status INTO v_submitter, v_status
  FROM public.group_taf_submissions
  WHERE id = p_submission_id;

  IF v_submitter IS NULL THEN
    RETURN false;
  END IF;

  -- Only the student who submitted may unsubmit.
  IF v_submitter <> auth.uid() THEN
    RETURN false;
  END IF;

  -- Cannot unsubmit a fully-approved TAF.
  IF v_status = 'approved' THEN
    RETURN false;
  END IF;

  DELETE FROM public.group_taf_submissions WHERE id = p_submission_id;
  RETURN true;
END;
$$;

-- Grant execution so the anon-key server role can call it.
GRANT EXECUTE ON FUNCTION public.unsubmit_taf_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsubmit_taf_submission(uuid) TO service_role;