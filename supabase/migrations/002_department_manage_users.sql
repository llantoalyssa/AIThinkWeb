-- ============================================
-- Department-level user management functions
-- These use SECURITY DEFINER to bypass RLS
-- so department users can manage all profiles.
-- ============================================

-- ============================================
-- Function: department_get_user_emails
-- Returns emails for a list of user IDs from auth.users.
-- SECURITY DEFINER so department can see emails.
-- ============================================
CREATE OR REPLACE FUNCTION department_get_user_emails(
    p_user_ids UUID[]
)
RETURNS TABLE (
    user_id UUID,
    email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('department', 'admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT au.id, au.email::TEXT
    FROM auth.users au
    WHERE au.id = ANY(p_user_ids);
END;
$$;

-- ============================================
-- Function: department_create_user
-- Creates auth user + profile with specified role.
-- Allows department to create users of any role.
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
    -- Check that the caller has department role
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('department', 'admin') THEN
        RETURN QUERY SELECT false, 'Only department accounts can create users.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Validate role
    IF p_role NOT IN ('student', 'adviser', 'associate_dean', 'dean', 'department', 'vcrdes') THEN
        RETURN QUERY SELECT false, 'Invalid role specified.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Validate email domain
    IF p_email NOT LIKE '%@g.batstate-u.edu.ph' THEN
        RETURN QUERY SELECT false, 'Only @g.batstate-u.edu.ph email addresses are allowed.'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Create the auth user
    INSERT INTO auth.users (
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_sent_at,
        confirmation_token,
        recovery_token,
        raw_user_meta_data,
        created_at,
        updated_at,
        role
    )
    VALUES (
        p_email,
        crypt(p_password, gen_salt('bf')),
        now(), -- auto-confirm email
        now(),
        '',
        '',
        jsonb_build_object(
            'first_name', p_first_name,
            'last_name', p_last_name,
            'middle_initial', p_middle_initial,
            'suffix', p_suffix,
            'sr_code', p_sr_code,
            'role', p_role
        ),
        now(),
        now(),
        'authenticated'
    )
    RETURNING id INTO v_user_id;

    -- Create the profile
    INSERT INTO public.profiles (
        id,
        first_name,
        last_name,
        middle_initial,
        suffix,
        sr_code,
        role,
        email,
        updated_at
    )
    VALUES (
        v_user_id,
        p_first_name,
        p_last_name,
        p_middle_initial,
        p_suffix,
        p_sr_code,
        p_role,
        p_email,
        now()
    );

    -- Also insert into auth.identities so the user can sign in
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        v_user_id,
        jsonb_build_object(
            'sub', v_user_id,
            'email', p_email
        ),
        'email',
        p_email,
        now(),
        now(),
        now()
    );

    RETURN QUERY SELECT true, 'User created successfully.'::TEXT, v_user_id;
END;
$$;

-- ============================================
-- Function: department_update_user
-- Updates a user's profile fields (name, role, etc.)
-- ============================================
CREATE OR REPLACE FUNCTION department_update_user(
    p_user_id UUID,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_middle_initial TEXT DEFAULT NULL,
    p_suffix TEXT DEFAULT NULL,
    p_sr_code TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check that the caller has department role
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('department', 'admin') THEN
        RETURN QUERY SELECT false, 'Only department accounts can update users.'::TEXT;
        RETURN;
    END IF;

    -- Validate role if provided
    IF p_role IS NOT NULL AND p_role NOT IN ('student', 'adviser', 'associate_dean', 'dean', 'department', 'vcrdes') THEN
        RETURN QUERY SELECT false, 'Invalid role specified.'::TEXT;
        RETURN;
    END IF;

    -- Update profile fields
    UPDATE public.profiles
    SET
        first_name = COALESCE(p_first_name, first_name),
        last_name = COALESCE(p_last_name, last_name),
        middle_initial = COALESCE(p_middle_initial, middle_initial),
        suffix = COALESCE(p_suffix, suffix),
        sr_code = COALESCE(p_sr_code, sr_code),
        role = COALESCE(p_role, role),
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'User not found.'::TEXT;
        RETURN;
    END IF;

    -- Update auth metadata to match
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_strip_nulls(jsonb_build_object(
        'first_name', p_first_name,
        'last_name', p_last_name,
        'middle_initial', p_middle_initial,
        'suffix', p_suffix,
        'sr_code', p_sr_code,
        'role', p_role
    ))
    WHERE id = p_user_id;

    RETURN QUERY SELECT true, 'User updated successfully.'::TEXT;
END;
$$;

-- ============================================
-- Function: department_delete_user
-- Deletes a user completely (auth + profile)
-- ============================================
CREATE OR REPLACE FUNCTION department_delete_user(
    p_user_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('department', 'admin') THEN
        RETURN QUERY SELECT false, 'Only department accounts can delete users.'::TEXT;
        RETURN;
    END IF;

    -- Delete from auth.users (cascades to profiles and memberships)
    DELETE FROM auth.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'User not found.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, 'User deleted successfully.'::TEXT;
END;
$$;
