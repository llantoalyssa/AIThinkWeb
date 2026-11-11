-- ============================================================
-- 027: Realtime for submission annotations (live comments)
-- ------------------------------------------------------------
-- Enables PostgreSQL Change-Data-Capture (realtime) for the
-- submission_annotations table so comment threads/replies/resolves
-- show up instantly on other users' open pages instead of being
-- polled every 5s.
-- ============================================================

-- Add the table to the realtime publication (idempotent).
-- If the subscription doesn't exist yet, create it.
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