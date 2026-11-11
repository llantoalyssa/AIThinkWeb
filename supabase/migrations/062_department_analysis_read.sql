-- ============================================================
-- 062_department_analysis_read.sql
--
-- The department is an OPTIONAL approver (it may act on any pending step) and
-- it holds `analytics.view` / `taf.approved.view` by default. Two read surfaces
-- were silently EMPTY for it, because RLS filtered the rows to zero rather than
-- refusing:
--
--   * a TAF opened from the department's TAF Submissions list rendered its
--     Classification & Domain card, Field of IT and the internal/external
--     similar-studies lists with no data — getSubmissionById() reads
--     taf_analysis_results with the USER client, and only approver roles
--     (021/033) or the student's adviser (003) had a SELECT policy;
--   * /dashboard/department/<id>/analytics drew every chart at zero, because
--     research-analytics.ts also reads taf_analysis_results and
--     topic_abstract_forms.
--
-- Both policies below mirror what the approver roles already have (021 for the
-- analysis, 036 for the TAF row) and what 055 already gave the department for
-- group_taf_submissions: the department may read every submission, so it may
-- read the analysis that belongs to it.
--
-- DELIBERATELY ROLE-SCOPED, not `has_permission('analytics.view')`:
--   granting analytics.view to an adviser must not widen that adviser's sight
--   past the groups they own. An adviser's own policy (003) already covers the
--   students they supervise, so the analytics page shows THEIR scope there.
--
-- Read-only: no INSERT/UPDATE/DELETE policy is added or changed.
--
-- Safe to re-run.
-- ============================================================

-- ── 1. Analysis rows (scores, SDG/field, internal + external matches) ───────
drop policy if exists "Department can view all analysis" on public.taf_analysis_results;

create policy "Department can view all analysis"
  on public.taf_analysis_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );

-- ── 2. TAF rows (proposed title, SDG categories, field of IT) ──────────────
drop policy if exists "Department can view all TAFs" on public.topic_abstract_forms;

create policy "Department can view all TAFs"
  on public.topic_abstract_forms
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );

-- Self-check (run as a department account, NOT in the SQL editor — the editor
-- bypasses RLS):
--   select count(*) from public.taf_analysis_results;   -- must be > 0
--   select count(*) from public.topic_abstract_forms;   -- must be > 0
