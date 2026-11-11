-- ============================================================
-- 054_has_permission_fn.sql
--
-- The single authority on "may this account do X", for use in RLS policies and
-- anywhere SQL must make the decision.
--
-- Resolution order (first hit wins):
--   1. an explicit row in user_permissions  → grant or DENY
--   2. the account's role default           → role_default_permissions
--   3. false
--
-- SECURITY DEFINER so a policy on ANY table can call it without the caller
-- needing read access to the permission tables themselves.
--
-- Nothing calls this yet, so applying it changes no behaviour. Safe to re-run.
-- ============================================================

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1. explicit grant or deny for this account
    (
      select up.granted
      from public.user_permissions up
      where up.user_id = uid
        and up.permission = perm
      limit 1
    ),
    -- 2. the role's default
    (
      select true
      from public.role_default_permissions rd
      join public.profiles p on p.id = uid
      where rd.role = p.role
        and rd.permission = perm
      limit 1
    ),
    -- 3. not granted
    false
  );
$$;

-- Convenience wrapper for the signed-in user, e.g. in a policy:
--   using (public.i_can('pages.audit'))
create or replace function public.i_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), perm);
$$;

-- The effective permission set for the signed-in user. One call, so the app can
-- build the side nav and the page guards from the SAME list RLS uses.
create or replace function public.my_permissions()
returns table (permission text)
language sql
stable
security definer
set search_path = public
as $$
  select perm as permission
  from (
    select p.key as perm
    from public.permissions p
  ) catalogue
  where public.has_permission(auth.uid(), catalogue.perm);
$$;

grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.i_can(text)               to authenticated;
grant execute on function public.my_permissions()          to authenticated;
