-- ============================================================
-- 047: Discover overview — add the similarity score to the
--      public row so the card's detail dialog can show it.
-- ------------------------------------------------------------
-- Creates the same curated public slice as 045, plus
-- `combined_score` from the TAF's latest analysis. Student names
-- stay MASKED in SQL. Anon callers use the function only.
--
-- CREATE OR REPLACE cannot add an OUT column, so DROP first.
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
  combined_score NUMERIC
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
    CASE WHEN s.status = 'approved' THEN 'approved' ELSE 'submitted' END AS status,
    COALESCE(a.combined_score, 0) AS combined_score
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
