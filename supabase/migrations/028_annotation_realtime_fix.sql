-- ============================================================
-- 028: Fix annotation realtime delivery
-- ------------------------------------------------------------
-- Two things realtime needs beyond just ADD TABLE to the
-- publication:
--   1) REPLICA IDENTITY FULL — otherwise UPDATE/DELETE events
--      (resolve / edit / delete comments) carry NO old-row and
--      are not delivered to subscribers. INSERT (new comments)
--      works without it, but this makes every change stream.
--   2) Re-assert the table is in the supabase_realtime
--      publication (idempotent), in case 027's DO-block ran in a
--      context where the publication wasn't visible.
-- ============================================================

ALTER TABLE public.submission_annotations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'submission_annotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.submission_annotations;
  END IF;
END $$;

-- Diagnostic: run this in the SQL Editor to confirm the table is
-- subscribed. It should return at least one row with
--   pubname         = supabase_realtime
--   schemaname      = public
--   tablename       = submission_annotations
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE tablename = 'submission_annotations';