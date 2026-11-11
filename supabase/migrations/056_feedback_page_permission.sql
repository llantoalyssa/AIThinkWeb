-- ============================================================
-- 056_feedback_page_permission.sql
--
-- Lets a GRANTED non-department account (e.g. one associate dean) see the
-- Feedback page.
--
-- The existing policy gated SELECT on `profiles.role IN ('department','admin')`.
-- This replaces that role test with the permission test. The department keeps
-- its access for free, because 'pages.feedback' is in the department role's
-- defaults in 053 — so nothing changes for the department, and a granted
-- associate dean gains read access.
--
-- Read-only on purpose: the department's DELETE policy is untouched, so a
-- granted associate dean can view feedback but not remove it. `feedback.reply`
-- stays a separate permission from `pages.feedback`.
--
-- Safe to re-run.
-- ============================================================

drop policy if exists "Department can view all feedback" on public.system_feedback;
create policy "Department can view all feedback" on public.system_feedback
  for select
  to authenticated
  using (
    public.has_permission(auth.uid(), 'pages.feedback')
  );
