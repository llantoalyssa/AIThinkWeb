-- ============================================================
-- 034: Realtime "new submission" for advisers
-- ------------------------------------------------------------
-- group_taf_submissions was not in the supabase_realtime
-- publication, so advisers could not live-update their advisory
-- group page when a student submitted a TAF. Adding it lets a
-- postgres_changes subscription fire on INSERT and the adviser
-- refetch the roster without a manual reload. REPLICA IDENTITY
-- FULL is set so any row change streams complete row data (not
-- just a diff on the primary key).
-- ============================================================

ALTER TABLE public.group_taf_submissions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'group_taf_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_taf_submissions;
  END IF;
END $$;

-- Diagnostic (should return row: supabase_realtime | public | group_taf_submissions)
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('submission_annotations', 'student_group_memberships', 'group_taf_submissions')
ORDER BY tablename;