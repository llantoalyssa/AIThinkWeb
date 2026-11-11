-- ============================================================
-- 026: Group members visible to the group's students
-- ------------------------------------------------------------
-- The existing RLS on student_group_memberships lets a student
-- SELECT only their OWN membership (student_id = auth.uid()),
-- so a student cannot list the other members of their advisory
-- group (only advisers could). This adds a SECURITY DEFINER
-- function so any member of a group can fetch that group's
-- member roster for display in the student group page.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_group_members(p_group_id UUID)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    middle_initial TEXT,
    sr_code TEXT,
    joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow an authenticated student who is a member of this group
    -- to see the roster.
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.student_group_memberships m
        WHERE m.group_id = p_group_id
          AND m.student_id = auth.uid()
    ) THEN
        -- Not a member: return nothing rather than leaking membership info
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        sm.id,
        sm.student_id,
        p.first_name,
        p.last_name,
        p.middle_initial,
        p.sr_code,
        sm.joined_at
    FROM public.student_group_memberships sm
    LEFT JOIN public.profiles p ON p.id = sm.student_id
    WHERE sm.group_id = p_group_id
    ORDER BY sm.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_members(UUID) TO authenticated;