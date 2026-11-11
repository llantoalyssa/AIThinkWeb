-- ============================================================
-- 048: Discover overview — read the SUBMITTED analysis version,
--      not an arbitrary one.
-- ------------------------------------------------------------
-- BUG: `LEFT JOIN taf_analysis_results a ON a.taf_id = s.taf_id`
-- matched EVERY analysis version of that TAF (V1..V5). Combined
-- with `SELECT DISTINCT ON (title) ... ORDER BY title,
-- s.submitted_at DESC`, the joined analysis row was whichever one
-- the planner happened to return — in practice the EARLIEST
-- version. So a discover card showed V1's score / SDG / field /
-- research gap even when the version actually submitted and
-- approved was V2/V3/V4/V5.
--
-- Only a LOW-similarity version may be submitted at all, so the
-- displayed score must be that version's score.
--
-- FIX:
--   1. Join on the exact version recorded on the submission
--      (`analysis_version`, NOT NULL since migration 006).
--   2. Take the title from the SUBMITTED SNAPSHOT (what was really
--      submitted) before falling back to the live form row, which
--      the enhancement may have rewritten since.
--   3. Return `version_number` so the UI can name the revision.
--
-- CREATE OR REPLACE cannot add an OUT column → DROP first.
-- ============================================================

DROP FUNCTION IF EXISTS public.discover_public_tafs();

CREATE FUNCTION public.discover_public_tafs()
RETURNS TABLE (
  title TEXT,
  owner TEXT,
  sdg_categories TEXT[],
  field_of_it TEXT,
  research_gap TEXT,
  date TIMESTAMPTZ,
  status TEXT,
  combined_score NUMERIC,
  version_number INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (LOWER(TRIM(q.title)))
    q.title,
    q.owner,
    q.sdg_categories,
    q.field_of_it,
    q.research_gap,
    q.date,
    q.status,
    q.combined_score,
    q.version_number
  FROM (
    SELECT
      -- Submitted snapshot first (that IS the submitted TAF). Strip any
      -- legacy HTML wrapper, then fall back to the live form row.
      TRIM(COALESCE(
        NULLIF(regexp_replace(COALESCE(s.taf_snapshot->>'proposedTitle', ''), '<[^>]*>', '', 'g'), ''),
        regexp_replace(COALESCE(f.proposed_title, ''), '<[^>]*>', '', 'g'),
        ''
      )) AS title,
      -- Masked owner, e.g. "A**** B*****" (first initial + stars per name).
      COALESCE(NULLIF(LEFT(p.first_name, 1), ''), '') || '****'
        || CASE WHEN NULLIF(p.first_name, '') IS NOT NULL
                  AND NULLIF(p.last_name,  '') IS NOT NULL
                THEN ' ' ELSE '' END
        || COALESCE(NULLIF(LEFT(p.last_name, 1), ''), '') || '*****' AS owner,
      COALESCE(a.sdg_categories, ARRAY[]::text[]) AS sdg_categories,
      COALESCE(a.field_of_it, '') AS field_of_it,
      COALESCE(a.research_gap_analysis, '') AS research_gap,
      COALESCE(s.fully_approved_at, s.submitted_at) AS date,
      CASE WHEN s.status = 'approved' THEN 'approved' ELSE 'submitted' END AS status,
      COALESCE(a.combined_score, 0) AS combined_score,
      a.version_number AS version_number,
      s.submitted_at AS submitted_at
    FROM public.group_taf_submissions s
    JOIN public.topic_abstract_forms f ON f.id = s.taf_id
    -- The version that was actually submitted (low similarity).
    LEFT JOIN public.taf_analysis_results a
      ON a.taf_id = s.taf_id
     AND a.version_number = s.analysis_version
    JOIN public.profiles p ON p.id = s.submitted_by
    WHERE s.status IN ('pending', 'under_review', 'approved')
  ) q
  ORDER BY LOWER(TRIM(q.title)), q.submitted_at DESC;
$$;

-- Only allow invocation (never read the underlying tables directly).
REVOKE ALL ON FUNCTION public.discover_public_tafs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_public_tafs() TO anon, authenticated;
