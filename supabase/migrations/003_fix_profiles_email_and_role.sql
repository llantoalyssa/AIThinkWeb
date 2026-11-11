-- ============================================
-- Fix profiles table: add email column and
-- fix the role check constraint to include
-- all 6 account types.
-- ============================================

-- 1. Add email column if missing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Drop the old role constraint and re-add it with all roles
-- First find the existing constraint name (it may be auto-named)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the check constraint on the role column
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'profiles'
      AND att.attname = 'role'
      AND con.contype = 'c';

    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Re-add the constraint with all 6 roles
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('student', 'adviser', 'associate_dean', 'dean', 'department', 'vcrdes'));
