-- ============================================================
-- 018: Similarity reduction guide
-- ------------------------------------------------------------
-- After each analysis, the AI produces a STRUCTURED guide
-- explaining why the TAF is still similar to its top-1 match
-- and exactly which research dimension to change (technology /
-- scope / population / methodology angle) to lower the score —
-- because paraphrasing alone barely moves SBERT similarity,
-- which matches on meaning/topic, not words.
-- ============================================================

ALTER TABLE public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS similarity_reduction JSONB;

COMMENT ON COLUMN public.taf_analysis_results.similarity_reduction IS
  'AI-generated guide: { driver, topMatchTitle, suggestions[] } explaining why the TAF overlaps its top match and how to differentiate it to lower similarity.';
