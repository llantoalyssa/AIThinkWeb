-- ============================================================
-- 065 — let a student keep seeing an ARCHIVED advisory group they still belong to
--
-- Why
--   `advisory_groups` SELECT was:
--       adviser_id = auth.uid()  OR  is_active = true
--   so the moment an adviser archived a group, the group row became invisible to
--   its own students. `getStudentJoinedGroups()` joins `advisory_groups!inner`,
--   so the join produced ZERO rows: the student was treated as having no group,
--   the "join a group" card came back, and `joinGroupByCode` still refused them
--   (it counts membership rows) — a dead end.
--
-- What
--   Membership is now sufficient to READ the group, archived or not. The rule is
--   expressed through a SECURITY DEFINER helper instead of an inline subquery:
--   the student_group_memberships policies themselves reference
--   advisory_groups, and an inline EXISTS would make the two policies evaluate
--   each other (RLS recursion).
--
--   Read access only. Archiving still hides the group from everyone who is not a
--   member (students joining by code only ever see `is_active = true`), and the
--   app treats an archived group as read-only for students.
--
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_memberships m
    WHERE m.group_id = p_group_id
      AND m.student_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "View advisory groups" ON public.advisory_groups;

CREATE POLICY "View advisory groups"
ON public.advisory_groups
FOR SELECT
USING (
  -- The adviser who owns it (active or archived).
  adviser_id = auth.uid()
  -- Active groups stay readable by everyone authenticated (join-by-code lookup).
  OR is_active = true
  -- A student who has NOT left and was NOT removed keeps read access after the
  -- group is archived, so they can review what was submitted and then leave.
  OR public.is_group_member(id)
);
