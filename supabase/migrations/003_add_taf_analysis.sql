-- ============================================
-- TAF Analysis Results table
-- Stores internal similarity, external search,
-- AI analysis, and scoring for each analyzed TAF
-- ============================================

-- Add 'analyzed' status to the taf_status enum
-- Note: ALTER TYPE ... ADD VALUE cannot be inside a transaction block
-- in older PostgreSQL versions. Run this separately if needed.
ALTER TYPE public.taf_status ADD VALUE IF NOT EXISTS 'analyzed';

-- ============================================
-- Main analysis results table
-- ============================================
CREATE TABLE IF NOT EXISTS public.taf_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the TAF being analyzed (one analysis per TAF)
  taf_id UUID NOT NULL REFERENCES public.topic_abstract_forms(id) ON DELETE CASCADE,

  -- ── Scoring ─────────────────────────────
  internal_similarity_score NUMERIC(5,2),   -- e.g. 68.00 (percentage, average of top 5)
  external_similarity_score NUMERIC(5,2),   -- e.g. 42.00 (percentage, average of top 5)
  combined_score NUMERIC(5,2),             -- 0.7 * internal + 0.3 * external
  judgment TEXT CHECK (judgment IN ('high_similarity', 'low_similarity')),

  -- ── Internal matches (top 5) ────────────
  -- JSONB array: [{taf_id, student_name, proposed_title, similarity_percent}]
  internal_matches JSONB,

  -- ── External matches (top 5) ────────────
  -- JSONB array: [{title, authors, publication, year, link, similarity_percent}]
  external_matches JSONB,

  -- ── AI Analysis ─────────────────────────
  sdg_categories TEXT[],                    -- e.g. {"SDG 4: Quality Education"}
  field_of_it TEXT,                         -- e.g. "Artificial Intelligence"
  research_gap_analysis TEXT,               -- free-text analysis
  recommendations JSONB,                    -- {title_suggestions: string[], background_suggestions: string[]}

  -- ── Metadata ────────────────────────────
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_by UUID REFERENCES auth.users(id),

  -- Constraints
  UNIQUE(taf_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_taf_analysis_taf_id ON public.taf_analysis_results(taf_id);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.taf_analysis_results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "Students can view own TAF analysis" ON public.taf_analysis_results;
DROP POLICY IF EXISTS "Students can insert own TAF analysis" ON public.taf_analysis_results;
DROP POLICY IF EXISTS "Advisers can view their students TAF analysis" ON public.taf_analysis_results;

-- Students can view analysis of their own TAFs
CREATE POLICY "Students can view own TAF analysis"
ON public.taf_analysis_results
FOR SELECT
USING (
  taf_id IN (
    SELECT id FROM public.topic_abstract_forms
    WHERE student_id = auth.uid()
  )
);

-- Students can insert analysis for their own TAFs
CREATE POLICY "Students can insert own TAF analysis"
ON public.taf_analysis_results
FOR INSERT
WITH CHECK (
  taf_id IN (
    SELECT id FROM public.topic_abstract_forms
    WHERE student_id = auth.uid()
  )
);

-- Advisers can view analysis of their students' TAFs
CREATE POLICY "Advisers can view their students TAF analysis"
ON public.taf_analysis_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.topic_abstract_forms taf
    JOIN public.student_group_memberships sgm ON sgm.student_id = taf.student_id
    JOIN public.advisory_groups ag ON ag.id = sgm.group_id
    WHERE taf.id = taf_analysis_results.taf_id
    AND ag.adviser_id = auth.uid()
  )
);

-- ============================================
-- Trigger to auto-update updated_at on parent TAF
-- ============================================
-- No trigger needed; TAF status update is handled in the server action
