-- ============================================
-- Add source column to analysis_cost_logs
-- Values: 'taf_analyze', 'taf_reanalyze', 'journal', 'other'
-- ============================================
ALTER TABLE public.analysis_cost_logs
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'taf_analyze'
CHECK (source IN ('taf_analyze', 'taf_reanalyze', 'journal', 'other'));
