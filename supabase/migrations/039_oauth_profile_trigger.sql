-- ============================================================
-- 039: Auto-create profile on new auth user + SR-code fill
-- ------------------------------------------------------------
-- 1) A trigger auto-creates the public.profiles row for ANY new
--    auth user (email signup AND Google OAuth), pulling names /
--    role / sr_code from user_metadata. Previously only register()
--    created the row, so Google OAuth users had NO profile.
-- 2) Extends update_own_profile_fields so a user can supply their
--    SR code, but ONLY when it is currently empty (a Google user
--    who couldn't supply one at sign-in can add it on the profile
--    page; an already-set value is never overwritten).
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Auto-create profile trigger ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first TEXT;
  v_last TEXT;
  v_full TEXT;
  v_meta JSONB;
BEGIN
  v_meta := NEW.raw_user_meta_data;
  v_full := COALESCE(v_meta->>'full_name', v_meta->>'name', '');
  v_first := COALESCE(v_meta->>'first_name', trim(split_part(v_full, ' ', 1)), '');
  -- Last name = everything after the first word of full_name (or a
  -- provided last_name/google family name). JS/postgres: strip first token.
  v_last := COALESCE(v_meta->>'last_name', v_meta->>'family_name', '');
  IF v_last = '' AND v_full <> '' THEN
    v_last := trim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1));
  END IF;

  INSERT INTO public.profiles (
    id, email,
    first_name, last_name, middle_initial, suffix,
    sr_code, role, avatar_url
  )
  VALUES (
    NEW.id, NEW.email,
    NULLIF(v_first, ''),
    NULLIF(v_last, ''),
    NULLIF(v_meta->>'middle_initial', ''),
    NULLIF(v_meta->>'suffix', ''),
    COALESCE(v_meta->>'sr_code', ''),
    CASE
      WHEN v_meta->>'role' IN
        ('student','adviser','associate_dean','dean','department','vcrdes')
      THEN v_meta->>'role'
      ELSE 'student'
    END,
    NULLIF(COALESCE(v_meta->>'avatar_url', v_meta->>'picture'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- NEVER let a profile-creation failure block the signup itself, but DO log
  -- the real reason so it's visible in the Supabase logs (else the failure is
  -- silent and the profile/name just never appears).
  RAISE NOTICE 'handle_new_user: profile insert failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 2. SR code fill (only when empty) ───────────────────────
CREATE OR REPLACE FUNCTION public.update_own_profile_fields(
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_middle_initial TEXT DEFAULT NULL,
  p_suffix TEXT DEFAULT NULL,
  p_sr_code TEXT DEFAULT NULL
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
    suffix         = COALESCE(p_suffix,         suffix),
    -- Only fill SR code when it's currently empty (never overwrite).
    sr_code        = CASE
                       WHEN (sr_code IS NULL OR sr_code = '') AND p_sr_code IS NOT NULL
                       THEN NULLIF(p_sr_code, '')
                       ELSE sr_code
                     END
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- ── 3. Diagnostic ───────────────────────────────────────────
SELECT proname FROM pg_proc
WHERE proname IN ('handle_new_user', 'update_own_profile_fields');