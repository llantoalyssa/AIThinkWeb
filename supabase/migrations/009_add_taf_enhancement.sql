-- ============================================
-- TAF Analysis Enhancement
-- Stores AI-generated improved content so the
-- UI can show "what was improved" (before/after)
-- ============================================

ALTER TABLE public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS enhancement JSONB;

-- enhancement shape:
-- {
--   "improvedTitle": "...",
--   "improvedBackground": "...",
--   "improvedObjectives": "...",
--   "improvedLiteratureReview": "...",
--   "improvedReferences": "...",
--   "changeSummary": "what changed and why"
-- }
