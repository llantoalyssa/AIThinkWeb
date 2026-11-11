-- Create user_taf_recents table to replace localStorage-based recents/pinned.
-- Each user gets their own recents that persist across devices.

CREATE TABLE IF NOT EXISTS public.user_taf_recents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taf_id UUID NOT NULL REFERENCES public.topic_abstract_forms(id) ON DELETE CASCADE,
  proposed_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  pinned BOOLEAN NOT NULL DEFAULT false,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, taf_id)
);

-- Enable RLS
ALTER TABLE public.user_taf_recents ENABLE ROW LEVEL SECURITY;

-- Users can only see their own recents
CREATE POLICY "Users can view their own recents"
  ON public.user_taf_recents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own recents
CREATE POLICY "Users can insert their own recents"
  ON public.user_taf_recents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own recents
CREATE POLICY "Users can update their own recents"
  ON public.user_taf_recents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own recents
CREATE POLICY "Users can delete their own recents"
  ON public.user_taf_recents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_taf_recents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_user_taf_recents_updated_at
  BEFORE UPDATE ON public.user_taf_recents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_taf_recents_updated_at();
