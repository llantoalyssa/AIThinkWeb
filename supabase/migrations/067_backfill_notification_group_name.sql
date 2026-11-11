-- ============================================================
-- 067: Backfill group_name on notifications that lack it
-- ------------------------------------------------------------
-- notify() used to resolve the submission's group with the SESSION
-- client. When an approver (not the group's adviser) triggered the
-- event, RLS hid the row, so `group_name` was written as NULL.
--
-- Every notification link is built from that name
-- (/dashboard/<role>/<id>/group/<slug>/submission/<id>), so a NULL
-- sent "your TAF was returned" / "someone commented" to the Topic
-- Abstract Form list instead of the TAF itself.
--
-- notify() now reads through the service role, so new rows are
-- correct. This repairs the rows already in the table.
-- ============================================================

UPDATE public.approval_notifications AS n
SET
  group_name = g.name,
  group_id = g.id
FROM public.group_taf_submissions AS s
JOIN public.advisory_groups AS g ON g.id = s.group_id
WHERE s.id = n.submission_id
  AND (n.group_name IS NULL OR n.group_id IS NULL);

-- Notifications with a submission but no resolvable group are dead links:
-- their click can never reach a TAF. Remove them.
DELETE FROM public.approval_notifications AS n
WHERE n.submission_id IS NOT NULL
  AND n.group_name IS NULL;
