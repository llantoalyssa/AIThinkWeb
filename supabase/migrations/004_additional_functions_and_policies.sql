-- ============================================
-- Migration 004: Additional DB functions & fixes
-- Run this after migrations 001-003.
-- ============================================

-- ============================================
-- 1. Update join_advisory_group_by_code to
--    enforce one-group-per-student policy
-- ============================================
CREATE OR REPLACE FUNCTION join_advisory_group_by_code(
    p_join_code TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    out_group_id UUID,
    group_name TEXT
) AS $$
DECLARE
    v_group_id UUID;
    v_group_name TEXT;
    v_student_id UUID;
    v_already_member BOOLEAN;
    v_existing_group_count INTEGER;
BEGIN
    v_student_id := auth.uid();

    IF v_student_id IS NULL THEN
        RETURN QUERY SELECT false, 'You must be logged in to join a group'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    -- One-group policy: student can only join one group
    SELECT COUNT(*) INTO v_existing_group_count
    FROM public.student_group_memberships
    WHERE student_id = v_student_id;

    IF v_existing_group_count > 0 THEN
        RETURN QUERY SELECT false, 'You can only join one advisory group. Leave your current group first.'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT ag.id, ag.name INTO v_group_id, v_group_name
    FROM public.advisory_groups ag
    WHERE ag.join_code = UPPER(p_join_code) AND ag.is_active = true;

    IF v_group_id IS NULL THEN
        RETURN QUERY SELECT false, 'Invalid join code. Please check and try again.'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.student_group_memberships
        WHERE student_group_memberships.student_id = v_student_id
        AND student_group_memberships.group_id = v_group_id
    ) INTO v_already_member;

    IF v_already_member THEN
        RETURN QUERY SELECT false, 'You are already a member of this group.'::TEXT, v_group_id, v_group_name;
        RETURN;
    END IF;

    INSERT INTO public.student_group_memberships (student_id, group_id)
    VALUES (v_student_id, v_group_id);

    RETURN QUERY SELECT true, 'Successfully joined the group!'::TEXT, v_group_id, v_group_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Function to count group members (bypasses RLS)
-- ============================================
CREATE OR REPLACE FUNCTION get_group_member_count(p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM public.student_group_memberships WHERE group_id = p_group_id);
END;
$$;

-- ============================================
-- 3. Policy: Department can view all memberships
-- ============================================
CREATE POLICY "Department can view all memberships"
ON public.student_group_memberships
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'department'
  )
);

-- ============================================
-- 4. Re-create department_create_user with email support
-- ============================================
CREATE OR REPLACE FUNCTION department_create_user(
    p_email TEXT,
    p_password TEXT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_middle_initial TEXT DEFAULT NULL,
    p_suffix TEXT DEFAULT NULL,
    p_sr_code TEXT DEFAULT '',
    p_role TEXT DEFAULT 'student'
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('department', 'admin') THEN
        RETURN QUERY SELECT false, 'Only department accounts can create users.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF p_role NOT IN ('student', 'adviser', 'associate_dean', 'dean', 'department', 'vcrdes') THEN
        RETURN QUERY SELECT false, 'Invalid role specified.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF p_email NOT LIKE '%@g.batstate-u.edu.ph' THEN
        RETURN QUERY SELECT false, 'Only @g.batstate-u.edu.ph email addresses are allowed.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    INSERT INTO auth.users (
        email, encrypted_password, email_confirmed_at, confirmation_sent_at,
        confirmation_token, recovery_token, raw_user_meta_data,
        created_at, updated_at, role
    )
    VALUES (
        p_email,
        crypt(p_password, gen_salt('bf')),
        now(), now(), '', '',
        jsonb_build_object(
            'first_name', p_first_name, 'last_name', p_last_name,
            'middle_initial', p_middle_initial, 'suffix', p_suffix,
            'sr_code', p_sr_code, 'role', p_role
        ),
        now(), now(), 'authenticated'
    )
    RETURNING id INTO v_user_id;

    INSERT INTO public.profiles (id, first_name, last_name, middle_initial, suffix, sr_code, role, email, updated_at)
    VALUES (v_user_id, p_first_name, p_last_name, p_middle_initial, p_suffix, p_sr_code, p_role, p_email, now());

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
        v_user_id, v_user_id,
        jsonb_build_object('sub', v_user_id, 'email', p_email),
        'email', p_email, now(), now(), now()
    );

    RETURN QUERY SELECT true, 'User created successfully.'::TEXT, v_user_id;
END;
$$;
