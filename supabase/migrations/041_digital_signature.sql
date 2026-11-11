-- ============================================================
-- 041: Digital signature (column + storage bucket + RPC)
-- ------------------------------------------------------------
-- Adds a signature_url column to profiles and creates the
-- `signatures` STORAGE BUCKET for affair digital signatures
-- (Associate Dean / Dean / Adviser / VCRDES). Files live under
-- "<user_id>/signature.<ext>" so each user can only manage their
-- own folder. The bucket is PUBLIC (served directly by URL) but
-- WRITE policies restrict upload/replace/delete to the owner's own
-- "<user_id>/" folder.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. profiles.signature_url ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- ── 2. signatures storage bucket ───────────────────────
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('signatures', 'signatures', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Ensure the bucket is public even if it existed beforehand.
UPDATE storage.buckets
SET public = true
WHERE id = 'signatures';

-- ── 3. storage.objects policies ────────────────────────
-- Read: any authenticated role can view signature images.
DROP POLICY IF EXISTS "Signature public read" ON storage.objects;
CREATE POLICY "Signature public read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'signatures');

-- Upload / replace: only inside your own folder.
DROP POLICY IF EXISTS "Users upload own signature" ON storage.objects;
CREATE POLICY "Users upload own signature"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Update (overwrite own).
DROP POLICY IF EXISTS "Users update own signature" ON storage.objects;
CREATE POLICY "Users update own signature"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'signatures'
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'signatures'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Delete own.
DROP POLICY IF EXISTS "Users delete own signature" ON storage.objects;
CREATE POLICY "Users delete own signature"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'signatures'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- ── 4. Update own signature URL (SECURITY DEFINER) ─────
CREATE OR REPLACE FUNCTION public.update_own_signature_url(p_signature_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET signature_url = p_signature_url
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- ── 5. Verify bucket exists ────────────────────────────
SELECT id, name, public
FROM storage.buckets
WHERE id = 'signatures';