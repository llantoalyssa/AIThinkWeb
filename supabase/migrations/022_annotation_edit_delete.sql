-- ============================================================
-- 022: Edit / delete annotations + replies
-- ------------------------------------------------------------
-- Adds an author-scoped DELETE policy (so the author can remove
-- their own comment or reply) and clarifies the UPDATE policy for
-- editing comment text. The existing UPDATE policy already exists
-- (author_id = auth.uid()) and covers editing; this migration
-- re-declares it for clarity and adds DELETE.
-- ============================================================

-- Editing comment/reply text (author only) — already present but re-declared
DROP POLICY IF EXISTS "Annotations updatable by author" ON public.submission_annotations;
CREATE POLICY "Annotations updatable by author"
ON public.submission_annotations
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Deleting a comment/reply (author only). Deleting a thread root
-- cascades via parent_id FK ... ON DELETE CASCADE to its replies.
DROP POLICY IF EXISTS "Annotations deletable by author" ON public.submission_annotations;
CREATE POLICY "Annotations deletable by author"
ON public.submission_annotations
FOR DELETE
USING (author_id = auth.uid());