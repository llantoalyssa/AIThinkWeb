-- ============================================================
-- 057_page_permission_policies.sql
--
-- Batch F: lets a GRANTED non-department account open the department console's
-- pages. Only ONE policy actually needs changing — checked against the schema:
--
--   journals      -> 007 already has "Anyone authenticated can view journals",
--                    so `pages.journals` needs NO policy.
--   profiles      -> readable by any authenticated user already (the Users page
--                    reads profiles), so `pages.users` needs NO policy.
--   audit_logs    -> 051 gates SELECT on the department role. THIS is the one.
--
-- The permission replaces the role test rather than adding to it, because
-- `pages.audit` is in the department role's defaults (053) — so the department
-- keeps access for free, and a granted associate dean gains read access.
--
-- Read-only: no INSERT/UPDATE/DELETE policy is added, so a granted role can
-- look at the trail and nothing else.
--
-- Safe to re-run.
-- ============================================================

drop policy if exists audit_logs_department_select on public.audit_logs;

create policy audit_logs_department_select on public.audit_logs
  for select
  to authenticated
  using (
    public.has_permission(auth.uid(), 'pages.audit')
  );
