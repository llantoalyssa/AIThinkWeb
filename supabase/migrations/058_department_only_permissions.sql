-- ============================================================
-- 058_department_only_permissions.sql
--
-- The user-management surface belongs to the department alone. It must not be
-- POSSIBLE to grant it to another role — not merely hidden in the dialog, since
-- a hidden checkbox is not a rule.
--
-- Two layers here (the UI and the server action are the third and fourth, done
-- in code):
--   1. a `department_only` flag on the catalogue, so the app can render these
--      rows as reserved instead of grantable;
--   2. a BEFORE INSERT/UPDATE trigger on user_permissions that raises if anyone
--      tries to attach a reserved permission to a non-department account —
--      including a direct SQL/PostgREST attempt.
--
-- Existing rows that violate the new rule are removed (there should be none;
-- this makes the migration self-healing if there were).
--
-- Safe to re-run.
-- ============================================================

-- ── 1. Mark the reserved permissions ────────────────────────────────────────
alter table public.permissions
  add column if not exists department_only boolean not null default false;

update public.permissions
   set department_only = true
 where key in (
   'pages.users',     -- see the Users page
   'users.create',    -- create accounts
   'users.edit',      -- edit accounts
   'users.disable',   -- enable/disable accounts
   'journals.manage', -- upload / edit / delete journals
   'feedback.reply'   -- reply to user feedback
 );

-- ── 2. Remove any existing violation ────────────────────────────────────────
delete from public.user_permissions up
 using public.permissions p, public.profiles pr
 where p.key = up.permission
   and p.department_only
   and pr.id = up.user_id
   and pr.role <> 'department';

-- ── 3. Enforce it in the database ───────────────────────────────────────────
create or replace function public.enforce_department_only_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved    boolean;
  target_role text;
begin
  select p.department_only into reserved
    from public.permissions p
   where p.key = new.permission;

  if coalesce(reserved, false) then
    select pr.role into target_role
      from public.profiles pr
     where pr.id = new.user_id;

    if coalesce(target_role, '') <> 'department' then
      raise exception
        'The permission "%" is reserved for department accounts and cannot be granted to a % account.',
        new.permission, coalesce(target_role, 'non-department')
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists user_permissions_department_only on public.user_permissions;

create trigger user_permissions_department_only
  before insert or update on public.user_permissions
  for each row
  execute function public.enforce_department_only_permission();
