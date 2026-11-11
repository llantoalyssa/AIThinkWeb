-- ============================================
-- Add role column to profiles table
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student' 
CHECK (role IN ('student', 'adviser', 'associate_dean', 'dean', 'department', 'vcrdes'));

-- Add profile detail columns (needed by register form)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS middle_initial TEXT,
ADD COLUMN IF NOT EXISTS suffix TEXT,
ADD COLUMN IF NOT EXISTS sr_code TEXT;

-- ============================================
-- Enable RLS on profiles if not already enabled
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all profiles (needed for middleware)
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated users to read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- Policy: Users can insert their own profile (needed during registration)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- ============================================
-- Create function to generate random join code
-- ============================================
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate 8-character alphanumeric code (uppercase)
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));
        
        -- Check if code already exists
        SELECT EXISTS(
            SELECT 1 FROM public.advisory_groups WHERE join_code = code
        ) INTO exists_check;
        
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Create advisory_groups table with join code
-- ============================================
CREATE TABLE IF NOT EXISTS public.advisory_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adviser_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    join_code TEXT UNIQUE NOT NULL DEFAULT generate_join_code(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster join code lookups
CREATE INDEX IF NOT EXISTS idx_advisory_groups_join_code 
ON public.advisory_groups(join_code);

-- Create index for adviser_id lookups
CREATE INDEX IF NOT EXISTS idx_advisory_groups_adviser_id 
ON public.advisory_groups(adviser_id);

-- ============================================
-- Create student_group_memberships table
-- For tracking which students are in which groups
-- ============================================
CREATE TABLE IF NOT EXISTS public.student_group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.advisory_groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, group_id)
);

-- Create indexes for membership lookups
CREATE INDEX IF NOT EXISTS idx_memberships_student_id 
ON public.student_group_memberships(student_id);

CREATE INDEX IF NOT EXISTS idx_memberships_group_id 
ON public.student_group_memberships(group_id);

-- ============================================
-- Enable RLS on tables
-- ============================================
ALTER TABLE public.advisory_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_memberships ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for advisory_groups
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Advisers can view own advisory groups" ON public.advisory_groups;
DROP POLICY IF EXISTS "Students can view joined groups" ON public.advisory_groups;
DROP POLICY IF EXISTS "Anyone can view groups by join code" ON public.advisory_groups;
DROP POLICY IF EXISTS "Advisers can create advisory groups" ON public.advisory_groups;
DROP POLICY IF EXISTS "Advisers can update own advisory groups" ON public.advisory_groups;
DROP POLICY IF EXISTS "Advisers can delete own advisory groups" ON public.advisory_groups;

-- Single SELECT policy combining all view scenarios (prevents infinite recursion)
CREATE POLICY "View advisory groups" 
ON public.advisory_groups 
FOR SELECT 
USING (
    -- Advisers can view their own groups
    adviser_id = auth.uid()
    -- Students can view active groups (for joining via code)
    OR is_active = true
);

-- Advisers can create their own advisory groups
CREATE POLICY "Advisers can create advisory groups" 
ON public.advisory_groups 
FOR INSERT 
WITH CHECK (adviser_id = auth.uid());

-- Advisers can update their own advisory groups
CREATE POLICY "Advisers can update own advisory groups" 
ON public.advisory_groups 
FOR UPDATE 
USING (adviser_id = auth.uid());

-- Advisers can delete their own advisory groups
CREATE POLICY "Advisers can delete own advisory groups" 
ON public.advisory_groups 
FOR DELETE 
USING (adviser_id = auth.uid());

-- ============================================
-- RLS Policies for student_group_memberships
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Students can view own memberships" ON public.student_group_memberships;
DROP POLICY IF EXISTS "Advisers can view group memberships" ON public.student_group_memberships;
DROP POLICY IF EXISTS "Students can join groups" ON public.student_group_memberships;
DROP POLICY IF EXISTS "Students can leave groups" ON public.student_group_memberships;
DROP POLICY IF EXISTS "Advisers can remove students from their groups" ON public.student_group_memberships;

-- Students can view their own memberships
CREATE POLICY "Students can view own memberships"
ON public.student_group_memberships
FOR SELECT
USING (student_id = auth.uid());

-- Advisers can view memberships of their own groups
CREATE POLICY "Advisers can view group memberships"
ON public.student_group_memberships
FOR SELECT
USING (
  group_id IN (
    SELECT id FROM public.advisory_groups WHERE adviser_id = auth.uid()
  )
);

-- Students can join groups (insert their own memberships)
CREATE POLICY "Students can join groups"
ON public.student_group_memberships
FOR INSERT
WITH CHECK (student_id = auth.uid());

-- Students can leave groups (delete their own memberships)
CREATE POLICY "Students can leave groups"
ON public.student_group_memberships
FOR DELETE
USING (student_id = auth.uid());

-- ============================================
-- Function to join a group using join code
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
    -- Get current user ID
    v_student_id := auth.uid();
    
    IF v_student_id IS NULL THEN
        RETURN QUERY SELECT false, 'You must be logged in to join a group'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Check if student is already in a group (one-group policy)
    SELECT COUNT(*) INTO v_existing_group_count
    FROM public.student_group_memberships
    WHERE student_id = v_student_id;
    
    IF v_existing_group_count > 0 THEN
        RETURN QUERY SELECT false, 'You can only join one advisory group. Leave your current group first.'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Find the group by join code
    SELECT ag.id, ag.name INTO v_group_id, v_group_name
    FROM public.advisory_groups ag
    WHERE ag.join_code = UPPER(p_join_code)
    AND ag.is_active = true;
    
    IF v_group_id IS NULL THEN
        RETURN QUERY SELECT false, 'Invalid join code. Please check and try again.'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Check if already a member
    SELECT EXISTS(
        SELECT 1 FROM public.student_group_memberships
        WHERE student_group_memberships.student_id = v_student_id
        AND student_group_memberships.group_id = v_group_id
    ) INTO v_already_member;
    
    IF v_already_member THEN
        RETURN QUERY SELECT false, 'You are already a member of this group.'::TEXT, v_group_id, v_group_name;
        RETURN;
    END IF;
    
    -- Add student to group
    INSERT INTO public.student_group_memberships (student_id, group_id)
    VALUES (v_student_id, v_group_id);
    
    RETURN QUERY SELECT true, 'Successfully joined the group!'::TEXT, v_group_id, v_group_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on advisory_groups
DROP TRIGGER IF EXISTS update_advisory_groups_updated_at ON public.advisory_groups;
CREATE TRIGGER update_advisory_groups_updated_at
    BEFORE UPDATE ON public.advisory_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Function to regenerate join code
-- ============================================
CREATE OR REPLACE FUNCTION regenerate_group_join_code(
    p_group_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_new_code TEXT;
    v_adviser_id UUID;
BEGIN
    -- Check if user is the adviser of this group
    SELECT adviser_id INTO v_adviser_id
    FROM public.advisory_groups
    WHERE id = p_group_id;
    
    IF v_adviser_id IS NULL THEN
        RAISE EXCEPTION 'Group not found';
    END IF;
    
    IF v_adviser_id != auth.uid() THEN
        RAISE EXCEPTION 'Only the adviser can regenerate the join code';
    END IF;
    
    -- Generate new code
    v_new_code := generate_join_code();
    
    -- Update the group
    UPDATE public.advisory_groups
    SET join_code = v_new_code
    WHERE id = p_group_id;
    
    RETURN v_new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to get a user's display name from auth metadata
-- (fallback when profiles row doesn't exist yet)
-- ============================================
CREATE OR REPLACE FUNCTION get_user_display_name(user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        raw_user_meta_data->>'first_name',
        raw_user_meta_data->>'full_name',
        raw_user_meta_data->>'name',
        'Unknown'
    ) || ' ' || COALESCE(
        raw_user_meta_data->>'last_name',
        ''
    )
    FROM auth.users
    WHERE id = user_id;
$$;
