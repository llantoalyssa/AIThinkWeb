-- ============================================================
-- 049: Store the complete scoring calculation with each analysis
-- ------------------------------------------------------------
-- The "Detailed Scoring" dialog shows the full breakdown (every
-- match's raw similarity, its value after noise reduction, the
-- renormalized rank weight, the contribution, the per-side
-- aggregate, the 70/30 combine and the threshold verdict).
--
-- Rather than re-deriving those numbers in the UI from constants
-- that may change in a later release, the analysis writes them down
-- once, at the moment it runs. Old rows simply have NULL here and
-- the dialog omits the card (their calculation really was
-- different, so re-deriving it would be misleading).
-- ============================================================

ALTER TABLE public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS scoring_breakdown JSONB;

COMMENT ON COLUMN public.taf_analysis_results.scoring_breakdown IS
  'Audit trail of the score: {noiseFloor, rankWeights, internal:{steps:[{rank,label,raw,reduced,weight,contribution}],aggregate}, external:{...}, internalWeight, externalWeight, internalTerm, externalTerm, combined, threshold, judgment}. NULL for analyses run before it was captured.';
