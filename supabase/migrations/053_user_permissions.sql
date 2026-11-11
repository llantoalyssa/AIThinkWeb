-- ============================================================
-- 053_user_permissions.sql
--
-- The permission layer. Roles stay the source of DEFAULTS; these tables hold
-- only the DEVIATIONS a department admin makes for one account.
--
-- Three tables, deliberately:
--   permissions              — the catalogue (single source of truth, so a typo
--                              cannot invent a permission)
--   role_default_permissions — what each role gets out of the box. Data, not
--                              code, so the app and RLS read the SAME defaults
--                              and cannot drift apart.
--   user_permissions         — per-account grant/deny. `granted = false` is an
--                              explicit DENY and beats the role default.
--
-- Nothing in the app reads these yet, so applying this migration changes no
-- behaviour. Safe to re-run.
-- ============================================================

-- ── Catalogue ───────────────────────────────────────────────────────────────
create table if not exists public.permissions (
  key         text primary key,
  label       text not null,
  description text,
  -- Structural permissions change WHO approves, not just what is visible.
  -- The UI must warn before granting these.
  structural  boolean not null default false
);

insert into public.permissions (key, label, description, structural) values
  ('groups.create',         'Create advisory groups',        'Create and manage advisory groups',                          true),
  ('groups.view',           'View advisory groups',          'See the Advisory Group page',                                 false),
  ('approval.participate',  'Participate in approvals',      'Approve or return TAFs at their own chain step',              true),
  ('analytics.view',        'View Research Analytics',       'See the Research Analytics tab',                              false),
  ('executive_summary.view','View Executive Summary',        'See the Executive Summary tab',                               false),
  ('taf.approved.view',     'View Approved TAFs',            'See the Approved TAF tab',                                    false),
  ('pages.users',           'Page: Users',                   'See the Users page',                                          false),
  ('pages.journals',        'Page: Journals',                'See the Journals page',                                       false),
  ('pages.feedback',        'Page: Feedback',                'See the user Feedback page',                                  false),
  ('pages.audit',           'Page: Audit Trail',             'See the Audit Trail',                                         false),
  ('users.create',          'Create user accounts',          'Create new user accounts',                                    false),
  ('users.edit',            'Edit user accounts',            'Edit existing user accounts',                                 false),
  ('users.disable',         'Enable/disable accounts',       'Set the active flag on an account',                           false),
  ('journals.manage',       'Manage journals',               'Upload, edit and delete journals',                            false),
  ('feedback.reply',        'Reply to feedback',             'Reply to user feedback',                                      false)
on conflict (key) do nothing;

-- ── Role defaults ───────────────────────────────────────────────────────────
create table if not exists public.role_default_permissions (
  role        text not null,
  permission  text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);

-- Defaults reproduce TODAY's behaviour exactly. Department has everything,
-- including groups.create (it may own advisory groups).
insert into public.role_default_permissions (role, permission) values
  -- adviser: dashboard + notifications, owns groups, approves the entry step
  ('adviser', 'groups.create'),
  ('adviser', 'groups.view'),
  ('adviser', 'approval.participate'),

  -- associate dean: owns groups, approver, analytics + approved tab
  ('associate_dean', 'groups.create'),
  ('associate_dean', 'groups.view'),
  ('associate_dean', 'approval.participate'),
  ('associate_dean', 'analytics.view'),
  ('associate_dean', 'taf.approved.view'),

  -- dean: as above, plus Executive Summary
  ('dean', 'groups.create'),
  ('dean', 'groups.view'),
  ('dean', 'approval.participate'),
  ('dean', 'analytics.view'),
  ('dean', 'executive_summary.view'),
  ('dean', 'taf.approved.view'),

  -- vcrdes: reviews only — deliberately NO groups.create / groups.view
  ('vcrdes', 'approval.participate'),
  ('vcrdes', 'analytics.view'),
  ('vcrdes', 'taf.approved.view'),

  -- student: none of the catalogue's capabilities
  -- (student features are not permission-gated)

  -- department: everything
  ('department', 'groups.create'),
  ('department', 'groups.view'),
  ('department', 'approval.participate'),
  ('department', 'analytics.view'),
  ('department', 'executive_summary.view'),
  ('department', 'taf.approved.view'),
  ('department', 'pages.users'),
  ('department', 'pages.journals'),
  ('department', 'pages.feedback'),
  ('department', 'pages.audit'),
  ('department', 'users.create'),
  ('department', 'users.edit'),
  ('department', 'users.disable'),
  ('department', 'journals.manage'),
  ('department', 'feedback.reply')
on conflict (role, permission) do nothing;

-- ── Per-account deviations ──────────────────────────────────────────────────
create table if not exists public.user_permissions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  permission  text not null references public.permissions(key) on delete cascade,
  granted     boolean not null default true,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  primary key (user_id, permission)
);

create index if not exists user_permissions_user_idx
  on public.user_permissions(user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.permissions              enable row level security;
alter table public.role_default_permissions enable row level security;
alter table public.user_permissions         enable row level security;

-- Catalogue + defaults: readable by any signed-in user (the UI needs labels),
-- written by nobody from the client.
drop policy if exists "permissions readable" on public.permissions;
create policy "permissions readable" on public.permissions
  for select to authenticated using (true);

drop policy if exists "role defaults readable" on public.role_default_permissions;
create policy "role defaults readable" on public.role_default_permissions
  for select to authenticated using (true);

-- A user may read their OWN grants; the department account manages all rows.
drop policy if exists "own permissions readable" on public.user_permissions;
create policy "own permissions readable" on public.user_permissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );

drop policy if exists "department manages permissions" on public.user_permissions;
create policy "department manages permissions" on public.user_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );
