-- ============================================================
-- 038: Profile self-update via SECURITY DEFINER (guaranteed write)
-- ------------------------------------------------------------
-- Ensure a student editing their own profile ALWAYS persists by using
-- SECURITY DEFINER functions keyed on auth.uid(). This bypasses any
-- RLS UPDATE quirk and rows are always addressed by the real auth id.
-- Fields editable by the user: first_name, last_name, middle_initial,
-- suffix, and avatar_url. (sr_code / email are NOT editable here.)
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Update editable name fields ──────────────────────────
CREATE OR REPLACE FUNCTION public.update_own_profile_fields(
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_middle_initial TEXT DEFAULT NULL,
  p_suffix TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    first_name     = COALESCE(p_first_name,     first_name),
    last_name      = COALESCE(p_last_name,      last_name),
    middle_initial = COALESCE(p_middle_initial, middle_initial),
    suffix         = COALESCE(p_suffix,         suffix)
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- ── 2. Update own avatar URL ────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_own_avatar_url(p_avatar_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET avatar_url = p_avatar_url
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- ── 3. Ensure the users can update their own profile row ────
-- (Re-assert the RLS UPDATE policy with an explicit WITH CHECK so no
--  Postgres version treats the missing WITH CHECK as a silent filter.)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ── 4. Diagnostic ───────────────────────────────────────────
SELECT proname
FROM pg_proc
WHERE proname IN ('update_own_profile_fields', 'update_own_avatar_url');