-- ============================================
-- Group TAF Submissions table
-- Tracks TAFs submitted by students to advisory groups
-- Includes fields ready for 4-approver workflow (future)
-- ============================================

CREATE TABLE IF NOT EXISTS public.group_taf_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.advisory_groups(id) ON DELETE CASCADE,
    taf_id UUID NOT NULL REFERENCES public.topic_abstract_forms(id) ON DELETE CASCADE,

    -- Snapshot of the TAF at time of submission (immutable)
    taf_snapshot JSONB NOT NULL,

    -- Analysis reference (which version was used for validation)
    analysis_version INTEGER NOT NULL,
    internal_score NUMERIC(5,2),
    external_score NUMERIC(5,2),
    combined_score NUMERIC(5,2),
    judgment TEXT CHECK (judgment IN ('high_similarity', 'low_similarity')),

    -- Workflow status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'under_review', 'approved', 'revisions_needed', 'rejected')),

    -- Future: 4-approver workflow fields
    approver_1 UUID REFERENCES auth.users(id),
    approver_2 UUID REFERENCES auth.users(id),
    approver_3 UUID REFERENCES auth.users(id),
    approver_4 UUID REFERENCES auth.users(id),
    approver_1_status TEXT DEFAULT 'pending'
        CHECK (approver_1_status IN ('pending', 'approved', 'rejected')),
    approver_2_status TEXT DEFAULT 'pending'
        CHECK (approver_2_status IN ('pending', 'approved', 'rejected')),
    approver_3_status TEXT DEFAULT 'pending'
        CHECK (approver_3_status IN ('pending', 'approved', 'rejected')),
    approver_4_status TEXT DEFAULT 'pending'
        CHECK (approver_4_status IN ('pending', 'approved', 'rejected')),

    -- Metadata
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_by UUID NOT NULL REFERENCES auth.users(id),

    -- A TAF can only be submitted once per group
    UNIQUE(taf_id, group_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_submissions_group_id
    ON public.group_taf_submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_submissions_taf_id
    ON public.group_taf_submissions(taf_id);
CREATE INDEX IF NOT EXISTS idx_group_submissions_status
    ON public.group_taf_submissions(status);
CREATE INDEX IF NOT EXISTS idx_group_submissions_submitted_by
    ON public.group_taf_submissions(submitted_by);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.group_taf_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "Students can view own submissions" ON public.group_taf_submissions;
DROP POLICY IF EXISTS "Students can insert own submissions" ON public.group_taf_submissions;
DROP POLICY IF EXISTS "Advisers can view group submissions" ON public.group_taf_submissions;

-- Students can view submissions they made
CREATE POLICY "Students can view own submissions"
ON public.group_taf_submissions
FOR SELECT
USING (submitted_by = auth.uid());

-- Students can submit TAFs to groups they belong to
CREATE POLICY "Students can insert own submissions"
ON public.group_taf_submissions
FOR INSERT
WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.student_group_memberships
        WHERE student_id = auth.uid()
        AND group_id = group_taf_submissions.group_id
    )
);

-- Advisers can view submissions in their groups
CREATE POLICY "Advisers can view group submissions"
ON public.group_taf_submissions
FOR SELECT
USING (
    group_id IN (
        SELECT id FROM public.advisory_groups
        WHERE adviser_id = auth.uid()
    )
);

-- ============================================
-- Trigger to auto-update updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_group_taf_submissions_updated_at ON public.group_taf_submissions;
CREATE TRIGGER update_group_taf_submissions_updated_at
    BEFORE UPDATE ON public.group_taf_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
