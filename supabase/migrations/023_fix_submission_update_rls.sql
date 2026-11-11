-- ============================================================
-- 023: Fix group_taf_submissions UPDATE policies (hard reset)
-- ------------------------------------------------------------
-- Symptom: Associate Dean clicking Approve fails with
--   "new row violates row-level security policy for table
--   group_taf_submissions"
--
-- Cause: The UPDATE policies for this table had conflicting
-- WITH CHECK expressions. 013's adviser/student policies carried
-- restrictive WITH CHECKs (e.g. submitted_by = auth.uid()), and
-- 013's approver policy used auth.jwt() -> 'role', which is always
-- 'authenticated' and never matches. When an approver approves, the
-- new row (current_approver_role transitions to the NEXT approver /
-- NULL / returned) must satisfy the WITH CHECK of every UPDATE policy
-- whose USING matched — a restrictive WITH CHECK on an unrelated role
-- blocks the transition.
--
-- Fix: Drop ALL UPDATE policies on this table and recreate them with
-- profiles-based USING (who may act) and WITH CHECK (true) (what the
-- new state may be). Authorization of WHO can approve/return/resubmit
-- lives in the server actions; the DB layer only needs to allow the
-- state transition. This guarantees the fixed approval cycle works for
-- every role regardless of earlier migration state.
-- ============================================================

DROP POLICY IF EXISTS "Approvers can update routed submissions" ON public.group_taf_submissions;
DROP POLICY IF EXISTS "Advisers can update group submissions" ON public.group_taf_submissions;
DROP POLICY IF EXISTS "Students can update own submissions" ON public.group_taf_submissions;

-- Approvers: may update a row that is currently routed to them.
CREATE POLICY "Approvers can update routed submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (
  current_approver_role = (
    SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
  )
)
WITH CHECK (true);

-- Adviser: may update rows in groups they own.
CREATE POLICY "Advisers can update group submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (
  group_id IN (
    SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
  )
)
WITH CHECK (true);

-- Student: may update / resubmit their own submission (and inline-edit
-- a returned one). Resubmits can only act on their own row.
CREATE POLICY "Students can update own submissions"
ON public.group_taf_submissions
FOR UPDATE
USING (submitted_by = auth.uid())
WITH CHECK (true);