-- ============================================================
-- 066: Remove notifications whose submission no longer exists
-- ------------------------------------------------------------
-- Withdrawing a TAF ("Unsubmit") runs unsubmit_taf_submission()
-- (migration 025), which DELETEs the group_taf_submissions row.
-- Every notification written for that submission then points at an
-- id that is gone: clicking it opens the submission view and the
-- lookup fails, so the user sees "TAF has been routed." instead of
-- the TAF.
--
-- New withdrawals now clear their own notifications (unsubmitTAF),
-- and the submission view returns an honest message instead of
-- "routed". This one-shot cleanup removes the dead rows that are
-- already in the table so older bells stop offering dead links.
-- ============================================================

DELETE FROM public.approval_notifications AS n
WHERE n.submission_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.group_taf_submissions AS s
    WHERE s.id = n.submission_id
  );

-- Same class of dead link: a notification whose group was deleted.
DELETE FROM public.approval_notifications AS n
WHERE n.group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.advisory_groups AS g
    WHERE g.id = n.group_id
  );
