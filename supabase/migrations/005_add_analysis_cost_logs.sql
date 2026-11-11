-- ============================================
-- Analysis Cost Logs
-- Tracks per-analysis costs (AI tokens, SerpAPI)
-- for transparency and monitoring
-- ============================================

CREATE TABLE IF NOT EXISTS public.analysis_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & what
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taf_id UUID REFERENCES public.topic_abstract_forms(id) ON DELETE SET NULL,
  version_number INTEGER,

  -- AI costs (DeepSeek via OpenCode Go)
  ai_provider TEXT NOT NULL DEFAULT 'opencode-go',
  ai_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  ai_input_tokens INTEGER NOT NULL DEFAULT 0,
  ai_output_tokens INTEGER NOT NULL DEFAULT 0,
  ai_cost NUMERIC(12,8) NOT NULL DEFAULT 0,  -- estimated USD

  -- SerpAPI costs
  serpapi_calls INTEGER NOT NULL DEFAULT 0,
  serpapi_cost NUMERIC(12,8) NOT NULL DEFAULT 0,

  -- Total
  total_cost NUMERIC(12,8) NOT NULL DEFAULT 0,

  -- Timestamp
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cost_logs_user ON public.analysis_cost_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_logs_taf ON public.analysis_cost_logs(taf_id);
CREATE INDEX IF NOT EXISTS idx_cost_logs_date ON public.analysis_cost_logs(analyzed_at DESC);

-- RLS: admin read, authenticated insert via server action
ALTER TABLE public.analysis_cost_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts from server action (authenticated)
CREATE POLICY "Authenticated users can insert cost logs"
ON public.analysis_cost_logs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow reading for authenticated users (for the public page)
CREATE POLICY "Authenticated users can view cost logs"
ON public.analysis_cost_logs
FOR SELECT
USING (auth.role() = 'authenticated');
