-- ============================================
-- TAF Analysis Versioning Support
-- ============================================
-- Changes to taf_analysis_results:
--   1. Remove UNIQUE(taf_id) → UNIQUE(taf_id, version_number)
--   2. Add version_number column
--   3. Add form_fields_snapshot (what fields looked like when analyzed)
--   4. Add notes (optional user notes per version)
-- ============================================

-- ── 1. Drop existing UNIQUE constraint ─────────────────
ALTER TABLE IF EXISTS public.taf_analysis_results
  DROP CONSTRAINT IF EXISTS taf_analysis_results_taf_id_key;

-- ── 2. Add version columns ────────────────────────────
ALTER TABLE IF EXISTS public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS form_fields_snapshot JSONB;

ALTER TABLE IF EXISTS public.taf_analysis_results
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── 3. New unique constraint per TAF + version ────────
ALTER TABLE IF EXISTS public.taf_analysis_results
  ADD CONSTRAINT taf_analysis_results_taf_id_version_key
  UNIQUE (taf_id, version_number);

-- ── 4. Update existing row(s) to version 1 ────────────
UPDATE public.taf_analysis_results
SET version_number = 1
WHERE version_number IS NULL OR version_number = 0;

-- ── 5. Index for version listing queries ──────────────
CREATE INDEX IF NOT EXISTS idx_taf_analysis_taf_id_version
  ON public.taf_analysis_results(taf_id, version_number DESC);

-- ============================================
-- RLS Policy updates
-- ============================================

-- Drop old insert policy temporarily to recreate
DROP POLICY IF EXISTS "Students can insert own TAF analysis" ON public.taf_analysis_results;

CREATE POLICY "Students can insert own TAF analysis"
ON public.taf_analysis_results
FOR INSERT
WITH CHECK (
  taf_id IN (
    SELECT id FROM public.topic_abstract_forms
    WHERE student_id = auth.uid()
  )
);
