-- ============================================================
-- 010: Clean up HTML wrapper in proposed_title
-- ------------------------------------------------------------
-- A previous enhancement write-back wrapped the proposed title in
-- <p> tags even though the title field is a plain <Input>. This
-- migration strips the leading <p> and trailing </p> from any
-- stored titles so they display cleanly everywhere.
-- ============================================================

-- 1) topic_abstract_forms.proposed_title
UPDATE public.topic_abstract_forms
SET proposed_title = regexp_replace(
      proposed_title,
      '^\s*<p[^>]*>(.*?)</p>\s*$',
      '\1',
      'g'
    )
WHERE proposed_title ~ '<p';

-- 2) taf_analysis_results.form_fields_snapshot (JSONB) — the
--    snapshot may hold a wrapped title for already-analyzed TAFs.
--    Fix the "proposedTitle" key if it is wrapped in <p>...</p>.
UPDATE public.taf_analysis_results
SET form_fields_snapshot = jsonb_set(
      form_fields_snapshot,
      '{proposedTitle}',
      to_jsonb(
        regexp_replace(
          COALESCE(form_fields_snapshot->>'proposedTitle', ''),
          '^\s*<p[^>]*>(.*?)</p>\s*$',
          '\1',
          'g'
        )
      )
    )
WHERE form_fields_snapshot ? 'proposedTitle'
  AND form_fields_snapshot->>'proposedTitle' LIKE '%<p%';

-- 3) group_taf_submissions.taf_snapshot (JSONB) — same cleanup.
UPDATE public.group_taf_submissions
SET taf_snapshot = jsonb_set(
      taf_snapshot,
      '{proposedTitle}',
      to_jsonb(
        regexp_replace(
          COALESCE(taf_snapshot->>'proposedTitle', ''),
          '^\s*<p[^>]*>(.*?)</p>\s*$',
          '\1',
          'g'
        )
      )
    )
WHERE taf_snapshot ? 'proposedTitle'
  AND taf_snapshot->>'proposedTitle' LIKE '%<p%';
