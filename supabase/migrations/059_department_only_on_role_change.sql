-- ============================================================
-- 059_department_only_on_role_change.sql
--
-- Closes a hole in 058. That migration refuses reserved permissions on INSERT/
-- UPDATE of user_permissions, and cleans up violations at apply time — but it
-- never fires when a PROFILE's role changes. So:
--
--   department account -> holds 'users.create' (reserved, allowed)
--   that account is re-roled to 'adviser'
--   -> its user_permissions row survives, and has_permission() still answers
--      true for a permission the adviser must never hold.
--
-- This trigger deletes reserved rows the moment an account stops being a
-- department account. Restricted rather than granted for correctness: only the
-- four chain roles' writes are gated elsewhere, and a role change is the only
-- event that can invalidate the invariant.
--
-- Composes with 050 (which blocks self role-changes): that guard fires BEFORE
-- UPDATE and raises; this one fires AFTER and only ever deletes permission rows.
--
-- Safe to re-run.
-- ============================================================

create or replace function public.enforce_department_only_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and coalesce(new.role, '') <> 'department' then
    delete from public.user_permissions up
     using public.permissions p
     where p.key = up.permission
       and p.department_only
       and up.user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_department_only_role_change on public.profiles;

create trigger profiles_department_only_role_change
  after update of role on public.profiles
  for each row
  execute function public.enforce_department_only_on_role_change();
