-- ============================================
-- User Account Active/Disable Status
-- ============================================
-- Adds is_active to profiles and enforces the
-- "1 active account per type" rule for
-- vcrdes, dean, and associate_dean roles.
-- ============================================

-- ── 1. Add is_active column ─────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Existing users are active by default.
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

-- ============================================
-- Function: department_create_user (v2)
-- Adds p_is_active + single-active-role rule
-- ============================================
CREATE OR REPLACE FUNCTION department_create_user(
    p_email TEXT,
    p_password TEXT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_middle_initial TEXT DEFAULT NULL,
    p_suffix TEXT DEFAULT NULL,
    p_sr_code TEXT DEFAULT '',
    p_role TEXT DEFAULT 'student',
    p_is_active BOOLEAN DEFAULT true
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
    v_active_exists BOOLEAN;
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

    -- Single-active-role rule: vcrdes, dean, associate_dean
    IF p_is_active AND p_role IN ('vcrdes', 'dean', 'associate_dean') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE role = p_role AND is_active = true
        ) INTO v_active_exists;

        IF v_active_exists THEN
            RETURN QUERY SELECT false,
                'An active ' || p_role || ' account already exists. Only one active ' || p_role || ' account is allowed. Disable the existing account first or create this account as Disabled.'::TEXT,
                NULL::UUID;
            RETURN;
        END IF;
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
            'role', p_role,
            'is_active', p_is_active
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
        is_active,
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
        p_is_active,
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
-- Function: department_update_user (v2)
-- Adds p_is_active + single-active-role rule
-- ============================================
CREATE OR REPLACE FUNCTION department_update_user(
    p_user_id UUID,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_middle_initial TEXT DEFAULT NULL,
    p_suffix TEXT DEFAULT NULL,
    p_sr_code TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
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
    v_current_role TEXT;
    v_current_active BOOLEAN;
    v_effective_role TEXT;
    v_effective_active BOOLEAN;
    v_active_exists BOOLEAN;
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

    -- Load current values
    SELECT role, is_active INTO v_current_role, v_current_active
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_current_role IS NULL THEN
        RETURN QUERY SELECT false, 'User not found.'::TEXT;
        RETURN;
    END IF;

    v_effective_role := COALESCE(p_role, v_current_role);
    v_effective_active := COALESCE(p_is_active, v_current_active);

    -- Cannot disable your own account (lockout protection)
    IF p_is_active = false AND p_user_id = auth.uid() THEN
        RETURN QUERY SELECT false, 'You cannot disable your own account.'::TEXT;
        RETURN;
    END IF;

    -- Single-active-role rule: vcrdes, dean, associate_dean
    IF v_effective_active AND v_effective_role IN ('vcrdes', 'dean', 'associate_dean') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE role = v_effective_role AND is_active = true AND id <> p_user_id
        ) INTO v_active_exists;

        IF v_active_exists THEN
            RETURN QUERY SELECT false,
                'An active ' || v_effective_role || ' account already exists. Only one active ' || v_effective_role || ' account is allowed. Disable the existing account first.'::TEXT;
            RETURN;
        END IF;
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
        is_active = COALESCE(p_is_active, is_active),
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
        'role', p_role,
        'is_active', p_is_active
    ))
    WHERE id = p_user_id;

    RETURN QUERY SELECT true, 'User updated successfully.'::TEXT;
END;
$$;

-- ============================================
-- RLS: department can read is_active
-- (profiles SELECT policy is already USING(true);
--  is_active is part of the row, so no change needed)
-- ============================================
