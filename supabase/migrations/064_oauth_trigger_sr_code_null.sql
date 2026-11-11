-- ============================================================
-- 064_oauth_trigger_sr_code_null.sql
--
-- The OAuth profile trigger (039) inserted `sr_code` as an EMPTY STRING:
--
--     COALESCE(v_meta->>'sr_code', '')
--
-- `profiles.sr_code` is UNIQUE, and this project's own rule is "insert NULL,
-- never ''" for exactly that reason. The consequence was invisible but real:
--
--   first Google sign-up  → profile row with sr_code = ''
--   every later one       → the INSERT raises 23505 (duplicate key on ''),
--                           the trigger's EXCEPTION handler swallows it as a
--                           NOTICE, and the account ends up with NO PROFILE.
--
-- With no profile the app cannot resolve a role, so the callback fell back to
-- "student", the student dashboard then found no profile and bounced the user
-- back to /login — Google sign-in that "just doesn't work", with nothing in the
-- UI to explain it.
--
-- This migration (a) makes the trigger insert NULL, and (b) repairs the rows it
-- already created.
--
-- Safe to re-run.
-- ============================================================

-- ── 1. Repair existing rows ─────────────────────────────────────────────────
-- NULL is allowed by the UNIQUE index (many NULLs); '' is not (only one).
update public.profiles
   set sr_code = null
 where sr_code = '';

-- ── 2. The trigger, with sr_code NULL ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last text;
  v_full text;
  v_meta jsonb;
begin
  v_meta := new.raw_user_meta_data;
  v_full := coalesce(v_meta->>'full_name', v_meta->>'name', '');
  v_first := coalesce(v_meta->>'first_name', trim(split_part(v_full, ' ', 1)), '');
  v_last := coalesce(v_meta->>'last_name', v_meta->>'family_name', '');
  if v_last = '' and v_full <> '' then
    v_last := trim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1));
  end if;

  insert into public.profiles (
    id, email,
    first_name, last_name, middle_initial, suffix,
    sr_code, role, avatar_url
  )
  values (
    new.id, new.email,
    nullif(v_first, ''),
    nullif(v_last, ''),
    nullif(v_meta->>'middle_initial', ''),
    nullif(v_meta->>'suffix', ''),
    -- NULL, never '': sr_code is UNIQUE and '' collides on the second sign-up.
    nullif(v_meta->>'sr_code', ''),
    case
      when v_meta->>'role' in
        ('student','adviser','associate_dean','dean','department','vcrdes')
      then v_meta->>'role'
      else 'student'
    end,
    nullif(coalesce(v_meta->>'avatar_url', v_meta->>'picture'), '')
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Never block the sign-up itself, but keep the real reason in the logs.
  raise notice 'handle_new_user: profile insert failed for %: %', new.email, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Self-check — must return zero rows after this migration:
--   select id, email from public.profiles where sr_code = '';
