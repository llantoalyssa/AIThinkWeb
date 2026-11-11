-- ============================================================
-- 060_permission_scope.sql
--
-- Two facts about a permission that the catalogue could not express, and one
-- question the dialog kept getting wrong:
--
--   applies_to  — WHICH ROLES may hold this key at all. Without it the dialog
--                 offers rows that can never do anything: `pages.users` to an
--                 adviser (no adviser Users page; the item it added pointed at
--                 /dashboard/department/<id> and the middleware bounced it), and
--                 every row to a student (student features are not
--                 permission-gated and no `pages.*` route exists under
--                 /dashboard/student).
--
--   fixed_roles — the roles for which a key IS the account type's own function,
--                 so it is not a choice: an adviser creates/owns advisory groups
--                 and sits in the approval chain by definition. Those rows now
--                 render CHECKED AND LOCKED ("included with this account type")
--                 instead of as a toggle that silently does nothing — for an
--                 adviser the group guard in advisory-groups.ts is
--                 department-only, so unticking it changed no behaviour at all.
--
-- NULL applies_to = every role (the default, so nothing changes for a key this
-- migration does not mention). It is enforced in the database, not just in the
-- dialog: a hidden checkbox is not a rule (same reasoning as 058).
--
-- Safe to re-run.
-- ============================================================

-- ── 1. The two columns ──────────────────────────────────────────────────────
alter table public.permissions
  add column if not exists applies_to  text[],
  add column if not exists fixed_roles text[] not null default '{}';

-- Start from a clean slate so a re-run cannot accumulate stale entries.
update public.permissions set applies_to = null, fixed_roles = '{}';

-- ── 2. fixed_roles — the account type's own function ────────────────────────
-- Advisory groups: the role for which this IS the account type's function.
-- VCRDES is deliberately absent — it reviews, it does not supervise.
-- The DEPARTMENT is deliberately absent too: it owns groups by default, but the
-- office wants to grant/revoke that per department account (migration 063), so a
-- locked row there would be wrong.
update public.permissions
   set fixed_roles = array['adviser', 'associate_dean', 'dean']
 where key in ('groups.create', 'groups.view');

-- Approvals: every role that holds a level in the chain, plus the department
-- (the optional approver that may act on any pending step).
-- Approvals: every role that holds a level in the CHAIN. The department has no
-- level (it is the optional stand-in approver), and its participation is
-- grantable per account — see migration 063.
update public.permissions
   set fixed_roles = array['adviser', 'associate_dean', 'dean', 'vcrdes']
 where key = 'approval.participate';

-- Executive Summary is the dean's own report.
update public.permissions
   set fixed_roles = array['dean']
 where key = 'executive_summary.view';

-- ── 3. applies_to — who may hold the key ────────────────────────────────────
-- Reserved / console-only capabilities: the department alone (058 enforces it
-- with a trigger; this is the same rule stated in the catalogue so the dialog
-- stops offering them to roles that can never hold them).
update public.permissions
   set applies_to = array['department']
 where key in (
   'pages.users', 'users.create', 'users.edit', 'users.disable',
   'journals.manage', 'feedback.reply'
 );

-- Advisory groups and approvals: the owners + the chain + the department.
update public.permissions
   set applies_to = array['adviser', 'associate_dean', 'dean', 'department']
 where key in ('groups.create', 'groups.view');

update public.permissions
   set applies_to = array['adviser', 'associate_dean', 'dean', 'vcrdes', 'department']
 where key in ('approval.participate', 'analytics.view', 'taf.approved.view');

-- Executive Summary: the dean holds it by default and keeps it LOCKED; the
-- department and VCRDES may be granted it, and so may an adviser — whose numbers
-- RLS scopes to the groups they own, which the adviser's page states out loud so
-- the report cannot be mistaken for a college-wide one.
update public.permissions
   set applies_to = array['adviser', 'dean', 'vcrdes', 'department']
 where key = 'executive_summary.view';

-- Pages that have a route inside each role's OWN dashboard:
--   journals / audit-trail  -> adviser, associate_dean, dean, vcrdes
--   users                   -> department only (above)
--   feedback                -> the approver roles (the adviser has no
--                              department-feedback route; a student's
--                              /feedback is their OWN feedback form, which is
--                              not this page)
update public.permissions
   set applies_to = array['adviser', 'associate_dean', 'dean', 'vcrdes', 'department']
 where key in ('pages.journals', 'pages.audit');

update public.permissions
   set applies_to = array['associate_dean', 'dean', 'vcrdes', 'department']
 where key = 'pages.feedback';

-- A student therefore has no configurable permission at all: the dialog says so
-- instead of rendering fifteen dead checkboxes.

-- ── 4. Remove rows this rule invalidates ────────────────────────────────────
delete from public.user_permissions up
 using public.permissions p, public.profiles pr
 where p.key = up.permission
   and pr.id = up.user_id
   and (
     p.department_only
     or (p.applies_to is not null and not (pr.role = any (p.applies_to)))
     or pr.role = any (p.fixed_roles)
   );

-- ── 5. Enforce it on every write to user_permissions ────────────────────────
-- Replaces the 058 trigger with one that answers all three questions in the
-- same place (department_only, applies_to, fixed_roles), so the two rules can
-- never drift apart or be applied in different orders.
create or replace function public.enforce_permission_grant_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved     boolean;
  scope        text[];
  fixed        text[];
  target_role  text;
  perm_label   text;
begin
  select p.department_only, p.applies_to, p.fixed_roles, p.label
    into reserved, scope, fixed, perm_label
    from public.permissions p
   where p.key = new.permission;

  select pr.role into target_role
    from public.profiles pr
   where pr.id = new.user_id;

  target_role := coalesce(target_role, '');

  if coalesce(reserved, false) and target_role <> 'department' then
    raise exception
      'The permission "%" is reserved for department accounts and cannot be granted to a % account.',
      new.permission, coalesce(nullif(target_role, ''), 'non-department')
      using errcode = '42501';
  end if;

  if scope is not null and not (target_role = any (scope)) then
    raise exception
      'The permission "%" does not apply to % accounts.',
      coalesce(perm_label, new.permission), coalesce(nullif(target_role, ''), 'this')
      using errcode = '42501';
  end if;

  if target_role = any (coalesce(fixed, '{}')) then
    raise exception
      'The permission "%" is part of the % account type and cannot be granted or denied per account.',
      coalesce(perm_label, new.permission), target_role
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists user_permissions_department_only on public.user_permissions;
drop trigger if exists user_permissions_grant_scope on public.user_permissions;

create trigger user_permissions_grant_scope
  before insert or update on public.user_permissions
  for each row
  execute function public.enforce_permission_grant_scope();

-- ── 6. …and on a ROLE CHANGE ────────────────────────────────────────────────
-- 059 handled the department_only half. A role change can now also strand a row
-- that no longer applies (adviser -> student) or one that became fixed
-- (student -> adviser). Same cleanup, wider predicate.
create or replace function public.enforce_permission_scope_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    delete from public.user_permissions up
     using public.permissions p
     where p.key = up.permission
       and up.user_id = new.id
       and (
         p.department_only
         or (p.applies_to is not null and not (coalesce(new.role, '') = any (p.applies_to)))
         or coalesce(new.role, '') = any (p.fixed_roles)
       );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_department_only_role_change on public.profiles;
drop trigger if exists profiles_permission_scope_role_change on public.profiles;

create trigger profiles_permission_scope_role_change
  after update of role on public.profiles
  for each row
  execute function public.enforce_permission_scope_on_role_change();

-- ── 7. Self-check ───────────────────────────────────────────────────────────
-- prints one row per permission with its scope; a NULL applies_to means "any
-- role" and an empty fixed_roles means "grantable for every role it applies to".
--
--   select key, label, applies_to, fixed_roles
--     from public.permissions order by key;
