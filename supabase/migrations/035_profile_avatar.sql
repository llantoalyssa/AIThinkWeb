-- ============================================================
-- 035: Profile avatar (columns + storage bucket)
-- ------------------------------------------------------------
-- Adds an avatar_url column to profiles and creates the `avatars`
-- STORAGE BUCKET for profile pictures. Files live under
-- "<user_id>/avatar.<ext>" so the path stays under Storage's
-- key-length cap and each user can only manage their own folder.
-- The bucket is PUBLIC (images served directly by URL), but the
-- WRITE policies still restrict upload/replace/delete to the
-- owner's own "<user_id>/" folder.
-- Idempotent: safe to re-run after the bucket was already created.
-- ============================================================

-- ── 1. profiles.avatar_url ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 2. avatars storage bucket ───────────────────────────
-- Create if missing, then force public = true in case an earlier
-- (manual) creation left it private. Uses a DO block so it works
-- whether or not the bucket already exists.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Ensure the bucket is public even if it existed beforehand.
UPDATE storage.buckets
SET public = true
WHERE id = 'avatars';

-- ── 3. storage.objects policies ────────────────────────
-- Read: any authenticated role can view avatar images.
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Upload / replace: only inside your own folder.
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Update (overwrite own).
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Delete own.
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- ── 4. Verify bucket exists ────────────────────────────
-- Diagnostic: should always return at least one row.
SELECT id, name, public
FROM storage.buckets
WHERE id = 'avatars';