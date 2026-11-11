-- ============================================================
-- 065_remove_feedback_reply_permission.sql
--
-- The permission catalogue offers "Reply to feedback" (`feedback.reply`), but
-- the app has no reply feature at all — feedback is VIEW-only (the department
-- reads the inbox and can delete an entry). A checkbox that toggles a capability
-- nothing implements is a lie in the permission console, so the key is removed.
--
-- No RLS policy references `feedback.reply` (only migrations 058/060 list it as
-- a department-only key, which simply stops matching once the row is gone), so
-- deleting the catalogue row is safe.
--
-- Order: delete the dependent rows first — `user_permissions` and
-- `role_default_permissions` reference `permissions(key)`.
--
-- Safe to re-run.
-- ============================================================

-- 1. Per-account overrides (grants and denies) for the retired key
delete from public.user_permissions
 where permission = 'feedback.reply';

-- 2. Role defaults (department held it by default)
delete from public.role_default_permissions
 where permission = 'feedback.reply';

-- 3. The catalogue row itself — this is what the permission console renders
delete from public.permissions
 where key = 'feedback.reply';

-- Self-check — both must return zero rows:
--   select * from public.permissions where key = 'feedback.reply';
--   select * from public.role_default_permissions where permission = 'feedback.reply';
