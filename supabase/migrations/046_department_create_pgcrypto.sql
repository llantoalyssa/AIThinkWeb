-- ============================================================
-- 046: department_create_user — fix crypt()/gen_salt() resolution
-- ------------------------------------------------------------
-- The department account-creation RPC hashes the password with
-- crypt(p_password, gen_salt('bf')), which comes from the pgcrypto
-- extension. Supabase installs pgcrypto into the `extensions`
-- schema, but department_create_user was defined with
-- `SET search_path = public` only — so gen_salt/crypt never resolve
-- and the RPC throws:  function gen_salt(unknown) does not exist.
--
-- Fix: (1) ensure pgcrypto exists in the `extensions` schema
-- (idempotent), and (2) redefine the function with
-- `SET search_path = public, extensions` so the hashing functions
-- resolve, and qualify them explicitly as extensions.crypt/gen_salt
-- for robustness.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_active_exists BOOLEAN;
    v_forced_inactive BOOLEAN := false;
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

    -- Single-active-role rule: only one active vcrdes / dean / associate_dean.
    -- If one is ALREADY active, still CREATE the new account but mark it
    -- INACTIVE (it can be made active later after disabling the current one) —
    -- we do NOT reject the creation.
    IF p_is_active AND p_role IN ('vcrdes', 'dean', 'associate_dean') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE role = p_role AND is_active = true
        ) INTO v_active_exists;

        IF v_active_exists THEN
            p_is_active := false;
            v_forced_inactive := true;
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
        extensions.crypt(p_password, extensions.gen_salt('bf')),
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

    IF v_forced_inactive THEN
        RETURN QUERY SELECT true,
            'User created as INACTIVE because an active ' || p_role || ' account already exists.'::TEXT,
            v_user_id;
    ELSE
        RETURN QUERY SELECT true, 'User created successfully.'::TEXT, v_user_id;
    END IF;
END;
$$;