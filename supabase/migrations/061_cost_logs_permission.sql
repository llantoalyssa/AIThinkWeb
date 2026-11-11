-- ============================================================
-- 061_cost_logs_permission.sql
--
-- Cost Logs (`/cost-logs`) becomes a REAL page permission, grantable to any
-- dashboard role, instead of a page every authenticated account could read.
--
-- Before this:
--   * there was no nav entry for it anywhere (the route existed, orphaned),
--   * the table's SELECT policy was `auth.role() = 'authenticated'`, so ANY
--     signed-in account — a student included — could read the college's AI /
--     SerpAPI spend by typing the URL.
--
-- After this, access is three layers (the project's standing rule):
--   1. the catalogue key `pages.cost_logs` — what the dialog grants/denies,
--   2. getCostLogs() refuses without the key,
--   3. THIS migration replaces the blanket SELECT policy with
--      has_permission(auth.uid(), 'pages.cost_logs'), so a direct PostgREST call
--      is refused too.
--
-- The department keeps it by default (it is the office that watches spend), and
-- every other role can be granted it from the Users dialog. Students are
-- deliberately OUT of `applies_to`: student surfaces are not permission-gated
-- in this app and /cost-logs has no student chrome, so offering the row would
-- be a toggle that cannot work.
--
-- Safe to re-run.
-- ============================================================

-- ── 1. The catalogue entry ──────────────────────────────────────────────────
insert into public.permissions (
  key, label, description, structural, department_only, applies_to, fixed_roles
)
values (
  'pages.cost_logs',
  'Page: Cost Logs',
  'See the Analysis Cost Logs page (AI + SerpAPI spend per analysis)',
  false,
  false,
  array['adviser', 'associate_dean', 'dean', 'vcrdes', 'department'],
  '{}'
)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description,
      applies_to  = excluded.applies_to,
      department_only = false,
      fixed_roles = '{}';

-- ── 2. Department holds it by default ───────────────────────────────────────
insert into public.role_default_permissions (role, permission)
values ('department', 'pages.cost_logs')
on conflict (role, permission) do nothing;

-- ── 3. RLS: the permission replaces "any authenticated account" ─────────────
drop policy if exists "Authenticated users can view cost logs" on public.analysis_cost_logs;
drop policy if exists "Cost logs readable with pages.cost_logs" on public.analysis_cost_logs;

create policy "Cost logs readable with pages.cost_logs"
  on public.analysis_cost_logs
  for select
  to authenticated
  using (public.has_permission(auth.uid(), 'pages.cost_logs'));

-- The INSERT policy from 005 stays as it is: the analysis pipeline (a server
-- action) has always been the only writer, and gating it on a page permission
-- would break analysis for accounts that may run one but not read the log.

-- ── 4. Clean up any grant the old rules allowed by accident ─────────────────
-- (rows for accounts whose role is outside applies_to — e.g. a student who was
-- granted before the row existed). Nothing should match on a fresh install.
delete from public.user_permissions up
 using public.permissions p, public.profiles pr
 where p.key = up.permission
   and pr.id = up.user_id
   and p.applies_to is not null
   and not (pr.role = any (p.applies_to));

-- Self-check:
--   select key, applies_to from public.permissions where key = 'pages.cost_logs';
--   -- as a granted account, this must return rows; as a student, zero:
--   select count(*) from public.analysis_cost_logs;
