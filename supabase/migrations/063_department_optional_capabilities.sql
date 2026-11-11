-- ============================================================
-- 063_department_optional_capabilities.sql
--
-- Makes three capabilities OPTIONAL for a DEPARTMENT account, so the console can
-- grant or revoke them per person:
--
--   groups.create          "Create advisory groups"
--   groups.view            "View advisory groups"
--   approval.participate   "Participate in approvals"
--
-- WHY THEY WERE LOCKED: migration 060 listed 'department' in `fixed_roles` for
-- these keys, which renders them as a checked, disabled row ("included with
-- Department Account"). The reasoning at the time was that owning groups and
-- acting as the optional approver are what a department account IS. That is not
-- what the office wants: a department colleague who only manages accounts or
-- journals should be able to hold NO group or approval access, while another
-- keeps it — so a fixed row is too blunt.
--
-- WHAT UNLOCKS: nothing else changes. `fixed_roles` is the ONLY thing the dialog
-- reads to decide "locked vs tickable", and the write path
-- (setUserPermission → enforce_permission_grant_scope) refuses a write exactly
-- when fixed_roles contains the target's role. Once 'department' is gone from
-- the array, the box is a normal checkbox whose baseline is the role default.
--
-- KEPT LOCKED, deliberately: adviser / associate dean / dean keep these keys
-- fixed, because for them the group surface IS their dashboard — a deny would
-- not hide a nav item, it would empty the page they work in all day.
--
-- EFFECT OF A DENY (already wired, no code change needed):
--   groups.view          → the Advisory Group nav item disappears, the
--                          ?section=groups panel shows the no-access notice, and
--                          advisory-groups.ts (departmentBlocked) refuses the list.
--   groups.create        → the create action refuses; existing groups stay.
--   approval.participate → the TAF Submissions item disappears, its panel shows
--                          the no-access notice, getPendingApprovals() refuses,
--                          and the approve/return actions refuse (this migration
--                          ships with that guard in approval-workflow.ts).
--
-- Safe to re-run. APPLY AFTER 060.
-- ============================================================

update public.permissions
   set fixed_roles = array['adviser', 'associate_dean', 'dean']
 where key in ('groups.create', 'groups.view');

update public.permissions
   set fixed_roles = array['adviser', 'associate_dean', 'dean', 'vcrdes']
 where key = 'approval.participate';

-- Clean up any override row that only existed because the key used to be fixed
-- (there should be none: the trigger refused those writes).
delete from public.user_permissions up
 using public.permissions p, public.profiles pr
 where p.key = up.permission
   and pr.id = up.user_id
   and pr.role = any (p.fixed_roles);

-- Self-check — for a department account the three rows must now be tickable:
--   select key, fixed_roles from public.permissions
--    where key in ('groups.create','groups.view','approval.participate');
