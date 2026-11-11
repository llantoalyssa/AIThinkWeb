-- ============================================================
-- 016: Journal embedding core text
-- ------------------------------------------------------------
-- The similarity comparison should measure the journal's
-- ACADEMIC CORE (title + abstract + keywords / early intro),
-- NOT its full text — full text includes Recommendation /
-- Conclusion / future-work sections that read like a student
-- proposal and inflate similarity scores.
--
-- Adds `embedding_text`: the trimmed core used to compute the
-- SBERT embedding. Existing rows are backfilled from the head
-- of extracted_text (abstract/intro region) — a re-embed via
-- the server action recomputes the vectors from this column.
-- ============================================================

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS embedding_text TEXT;

-- Backfill: take the head of the extracted text (typically the
-- abstract + introduction) and cut it at the first section
-- boundary so recommendations/conclusions are excluded.
UPDATE public.journals
SET embedding_text = LEFT(extracted_text, 1200)
WHERE embedding_text IS NULL
  AND extracted_text IS NOT NULL
  AND length(extracted_text) > 0;

-- Journals with no extractable text get the title as their core.
UPDATE public.journals
SET embedding_text = title
WHERE embedding_text IS NULL;
