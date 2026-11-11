-- ============================================
-- Journals table for department-uploaded PDFs
-- Stores extracted text + SBERT embedding for
-- similarity comparison with student TAFs.
-- ============================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the journals table
CREATE TABLE IF NOT EXISTS public.journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who uploaded it
  department_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Metadata (filled by department on upload)
  title TEXT NOT NULL,
  authors TEXT,
  year TEXT,

  -- File reference
  file_url TEXT NOT NULL,         -- Supabase Storage path

  -- Extracted content
  extracted_text TEXT,            -- Full text extracted from PDF
  embedding VECTOR(384),          -- SBERT embedding for similarity search

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_journals_department ON public.journals(department_id);
CREATE INDEX IF NOT EXISTS idx_journals_created ON public.journals(created_at DESC);

-- IVFFlat index for approximate nearest neighbor search on embeddings
CREATE INDEX IF NOT EXISTS idx_journals_embedding
ON public.journals
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- RLS
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read journals
CREATE POLICY "Anyone authenticated can view journals"
ON public.journals
FOR SELECT
USING (auth.role() = 'authenticated');

-- Department users can insert journals
CREATE POLICY "Department can insert journals"
ON public.journals
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'department'
  )
);

-- Department can update their own journals
CREATE POLICY "Department can update own journals"
ON public.journals
FOR UPDATE
USING (department_id = auth.uid());

-- Department can delete their own journals
CREATE POLICY "Department can delete own journals"
ON public.journals
FOR DELETE
USING (department_id = auth.uid());

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_journals_updated_at ON public.journals;
CREATE TRIGGER update_journals_updated_at
  BEFORE UPDATE ON public.journals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
