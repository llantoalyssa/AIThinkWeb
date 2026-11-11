-- ============================================================
-- 050: an account cannot change its OWN role or active flag.
--
-- The Department console edits other people's accounts. Its own row carries the
-- caller's role + is_active, so self-editing there is exactly how an admin locks
-- themselves out of the console (or silently changes their own privileges).
-- The UI already disables the Edit button on your own row and the server action
-- refuses it; this trigger is the layer that no client can bypass — including a
-- direct PostgREST call to the department_update_user RPC.
--
-- Safety notes:
--   * Fires ONLY when role or is_active actually CHANGE, so a normal profile
--     save (name / middle initial / suffix / sr_code) is unaffected.
--   * auth.uid() is NULL for service-role / background writes (the create path
--     and the on_auth_user_created trigger), so those are NOT blocked.
--   * Complements the existing rules in migration 008 ("You cannot disable your
--     own account") and the single-active-role rule for dean / associate_dean /
--     vcrdes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_self_role_or_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- No authenticated caller (service role, migration, trigger chain) → allow.
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id = auth.uid()
       AND (
            NEW.role IS DISTINCT FROM OLD.role
         OR NEW.is_active IS DISTINCT FROM OLD.is_active
       ) THEN
        RAISE EXCEPTION 'You cannot change your own role or account status. Ask another department account to do it.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_role_or_status_change ON public.profiles;

CREATE TRIGGER profiles_prevent_self_role_or_status_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_role_or_status_change();
