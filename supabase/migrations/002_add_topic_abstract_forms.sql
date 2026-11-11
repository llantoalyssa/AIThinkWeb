-- ============================================
-- Topic Abstract Forms table
-- Stores student-submitted topic abstract forms
-- with draft / submitted workflow
-- ============================================

CREATE TYPE public.taf_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'revisions_needed'
);

CREATE TABLE IF NOT EXISTS public.topic_abstract_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Form fields
  proposed_title TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  literature_review TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '',
  reference_list TEXT NOT NULL DEFAULT '',
  
  -- Workflow
  status taf_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  adviser_feedback TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_taf_student_id ON public.topic_abstract_forms(student_id);
CREATE INDEX IF NOT EXISTS idx_taf_status ON public.topic_abstract_forms(status);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.topic_abstract_forms ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "Students can view own TAFs" ON public.topic_abstract_forms;
DROP POLICY IF EXISTS "Students can create own TAFs" ON public.topic_abstract_forms;
DROP POLICY IF EXISTS "Students can update own TAFs" ON public.topic_abstract_forms;
DROP POLICY IF EXISTS "Students can delete own draft TAFs" ON public.topic_abstract_forms;
DROP POLICY IF EXISTS "Advisers can view their students TAFs" ON public.topic_abstract_forms;
DROP POLICY IF EXISTS "Advisers can update their students TAFs" ON public.topic_abstract_forms;

-- Students can view their own TAFs
CREATE POLICY "Students can view own TAFs"
ON public.topic_abstract_forms
FOR SELECT
USING (student_id = auth.uid());

-- Students can create their own TAFs
CREATE POLICY "Students can create own TAFs"
ON public.topic_abstract_forms
FOR INSERT
WITH CHECK (student_id = auth.uid());

-- Students can update their own TAFs (any status)
CREATE POLICY "Students can update own TAFs"
ON public.topic_abstract_forms
FOR UPDATE
USING (student_id = auth.uid());

-- Students can delete only draft TAFs
CREATE POLICY "Students can delete own draft TAFs"
ON public.topic_abstract_forms
FOR DELETE
USING (
  student_id = auth.uid()
  AND status = 'draft'
);

-- Advisers can view TAFs of students in their groups
CREATE POLICY "Advisers can view their students TAFs"
ON public.topic_abstract_forms
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_group_memberships sgm
    JOIN public.advisory_groups ag ON ag.id = sgm.group_id
    WHERE sgm.student_id = topic_abstract_forms.student_id
    AND ag.adviser_id = auth.uid()
  )
);

-- Advisers can update TAFs of their students (for review/feedback)
CREATE POLICY "Advisers can update their students TAFs"
ON public.topic_abstract_forms
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.student_group_memberships sgm
    JOIN public.advisory_groups ag ON ag.id = sgm.group_id
    WHERE sgm.student_id = topic_abstract_forms.student_id
    AND ag.adviser_id = auth.uid()
  )
);

-- ============================================
-- Trigger to auto-update updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_topic_abstract_forms_updated_at ON public.topic_abstract_forms;
CREATE TRIGGER update_topic_abstract_forms_updated_at
  BEFORE UPDATE ON public.topic_abstract_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
