-- ============================================================
-- 045: Public Discover overview — TAFs in the approver workflow
-- ------------------------------------------------------------
-- The /discover page is PUBLIC (no login). Its data lives in
-- RLS-protected tables that anonymous visitors cannot read. This
-- SECURITY DEFINER function runs as the table owner (bypasses RLS)
-- and returns a curated public slice: ONE submission per topic from
-- group_taf_submissions that has been SUBMITTED TO THE APPROVERS
-- (status pending/under_review) or FULLY APPROVED (status approved).
-- Student names are MASKED in SQL so they never leave the DB.
--
-- Anonymous callers invoke it via PostgREST (anon role) even without
-- a session.
-- ============================================================

-- In case an earlier 045 with the old (analyzed low-similarity) query
-- was already applied, remove it and create the new one.
DROP FUNCTION IF EXISTS public.discover_low_similarity_tafs();

CREATE OR REPLACE FUNCTION public.discover_public_tafs()
RETURNS TABLE (
  title TEXT,
  owner TEXT,
  sdg_categories TEXT[],
  field_of_it TEXT,
  research_gap TEXT,
  date TIMESTAMPTZ,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (LOWER(TRIM(f.proposed_title)))
    TRIM(COALESCE(f.proposed_title, s.taf_snapshot->>'proposedTitle', '')) AS title,
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
    -- Status for the public card: submitted-to-approvers vs fully approved.
    CASE WHEN s.status = 'approved' THEN 'approved' ELSE 'submitted' END AS status
  FROM public.group_taf_submissions s
  JOIN public.topic_abstract_forms f ON f.id = s.taf_id
  LEFT JOIN public.taf_analysis_results a ON a.taf_id = s.taf_id
  JOIN public.profiles p ON p.id = s.submitted_by
  WHERE s.status IN ('pending', 'under_review', 'approved')
  ORDER BY LOWER(TRIM(f.proposed_title)), s.submitted_at DESC;
$$;

-- Only allow invocation (never read the underlying tables directly).
REVOKE ALL ON FUNCTION public.discover_public_tafs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_public_tafs() TO anon, authenticated;