-- ============================================================
-- 017: Cost log title snapshot
-- ------------------------------------------------------------
-- analysis_cost_logs only stored taf_id, so once a TAF was
-- deleted the title resolved to "(deleted)" and journal rows
-- (which have no TAF) always showed "(journal metadata)".
--
-- Adds a `title` snapshot column, populated at insert time so
-- titles survive TAF deletion, and backfills existing rows.
-- ============================================================

ALTER TABLE public.analysis_cost_logs
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Backfill TAF-backed rows from the (possibly still existing) TAFs.
UPDATE public.analysis_cost_logs c
SET title = t.proposed_title
FROM public.topic_abstract_forms t
WHERE c.title IS NULL
  AND c.taf_id IS NOT NULL
  AND t.id = c.taf_id;
