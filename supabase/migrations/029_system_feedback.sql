-- ============================================================
-- 029: User feedback on the system
-- ------------------------------------------------------------
-- Any authenticated user can submit feedback (a 1-5 rating plus a
-- description) about the system. Department can view and delete it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  description TEXT NOT NULL CHECK (char_length(description) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_feedback_user ON public.system_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_system_feedback_created ON public.system_feedback(created_at DESC);

ALTER TABLE public.system_feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit their own feedback
DROP POLICY IF EXISTS "Users can submit own feedback" ON public.system_feedback;
CREATE POLICY "Users can submit own feedback"
ON public.system_feedback
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Department (and admin) can read all feedback
DROP POLICY IF EXISTS "Department can view all feedback" ON public.system_feedback;
CREATE POLICY "Department can view all feedback"
ON public.system_feedback
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('department', 'admin')
  )
);

-- Department (and admin) can delete feedback
DROP POLICY IF EXISTS "Department can delete feedback" ON public.system_feedback;
CREATE POLICY "Department can delete feedback"
ON public.system_feedback
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('department', 'admin')
  )
);

-- Users can update/delete their own feedback
DROP POLICY IF EXISTS "Users can manage own feedback" ON public.system_feedback;
CREATE POLICY "Users can manage own feedback"
ON public.system_feedback
FOR DELETE
USING (user_id = auth.uid());