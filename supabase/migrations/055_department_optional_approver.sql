-- ============================================================
-- 055_department_optional_approver.sql
--
-- Makes the department role able to SEE every TAF in flight and ACT on any
-- pending step, at any time — the "optional approver" capability.
--
-- Why a policy is needed at all: the approval server actions use the USER
-- client (not the service role), so RLS governs them. Without this, the
-- department's TAF Submissions page renders EMPTY instead of forbidden, and
-- every write silently affects 0 rows.
--
-- Scope of the grant: the department, and only while it still holds
-- 'approval.participate' (so a department account whose permission is revoked
-- loses this too, no code change needed).
--
-- NOTE ON THE UPDATE POLICY: RLS cannot restrict COLUMNS. This allows the
-- department to update a submission row; WHICH columns it may change, and at
-- which step, stays enforced in the server action. The chain order is never
-- permission-controlled.
--
-- The CHECK constraint on current_approver_role (adviser/associate_dean/dean/
-- vcrdes) is deliberately NOT extended: the department never becomes the
-- current step. It acts on OTHER roles' steps, and it is the entry-step
-- approver for groups it owns (that step is 'adviser', as for any owner).
--
-- Safe to re-run.
-- ============================================================

-- ── Read: every submission, any status, for the department ──────────────────
drop policy if exists "Department can view all submissions" on public.group_taf_submissions;
create policy "Department can view all submissions" on public.group_taf_submissions
  for select
  to authenticated
  using (
    public.has_permission(auth.uid(), 'approval.participate')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );

-- ── Write: act on whatever step is currently pending ───────────────────────
-- This also covers a department account that OWNS a group and therefore approves
-- that group's entry step (the same owner case the associate dean and dean use).
drop policy if exists "Department can act on any step" on public.group_taf_submissions;
create policy "Department can act on any step" on public.group_taf_submissions
  for update
  to authenticated
  using (
    public.has_permission(auth.uid(), 'approval.participate')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  )
  with check (
    public.has_permission(auth.uid(), 'approval.participate')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'department'
    )
  );
