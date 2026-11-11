-- ============================================================
-- 012: TAF approval workflow & routing
-- ------------------------------------------------------------
-- Extends group_taf_submissions with the approval chain:
--   Student → Adviser → Associate Dean → Dean → VCRDES
-- Reuses the existing approver_1..4 columns (adviser=1,
-- associate_dean=2, dean=3, vcrdes=4) and adds:
--   • current_approver_role — who the TAF is currently routed to
--   • approval_route — the route chosen by the adviser (JSONB
--     array of roles, e.g. ["associate_dean","dean","vcrdes"])
--   • per-step decision metadata (who/when/note)
--   • return metadata (reason, by, at)
--   • approval_notifications table for routing alerts
-- ============================================================

-- ── 1. Extend group_taf_submissions ─────────────────────
ALTER TABLE public.group_taf_submissions
  ADD COLUMN IF NOT EXISTS current_approver_role TEXT
    CHECK (current_approver_role IN ('adviser','associate_dean','dean','vcrdes')),
  ADD COLUMN IF NOT EXISTS approval_route JSONB,
  ADD COLUMN IF NOT EXISTS approver_1_decision_note TEXT,
  ADD COLUMN IF NOT EXISTS approver_1_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approver_2_decision_note TEXT,
  ADD COLUMN IF NOT EXISTS approver_2_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approver_3_decision_note TEXT,
  ADD COLUMN IF NOT EXISTS approver_3_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approver_4_decision_note TEXT,
  ADD COLUMN IF NOT EXISTS approver_4_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_reason TEXT,
  ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fully_approved_at TIMESTAMPTZ;

-- Index for pending-approval queries (routed-to-me)
CREATE INDEX IF NOT EXISTS idx_group_submissions_current_role
  ON public.group_taf_submissions(current_approver_role)
  WHERE current_approver_role IS NOT NULL;

-- ── 2. Approval notifications ───────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.group_taf_submissions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'routed_to_approver',      -- TAF routed to this approver's inbox
    'returned_to_student',     -- TAF returned for revision
    'resubmitted',             -- student resubmitted (for adviser)
    'fully_approved'           -- final approver approved the TAF
  )),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_notifications_user
  ON public.approval_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_notifications_submission
  ON public.approval_notifications(submission_id);

-- ── 3. RLS ──────────────────────────────────────────────
ALTER TABLE public.approval_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their own notifications" ON public.approval_notifications;
CREATE POLICY "Users see their own notifications"
ON public.approval_notifications
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Server inserts notifications" ON public.approval_notifications;
CREATE POLICY "Server inserts notifications"
ON public.approval_notifications
FOR INSERT
WITH CHECK (true);

-- ── 4. Seed route values for existing rows ──────────────
-- Any submission that was already fully 'approved' before this
-- migration is treated as fully approved. Rows still pending with
-- an adviser step get routed to the adviser.
UPDATE public.group_taf_submissions
SET fully_approved_at = COALESCE(fully_approved_at, updated_at)
WHERE status = 'approved';

UPDATE public.group_taf_submissions
SET current_approver_role = 'adviser'
WHERE current_approver_role IS NULL
  AND status IN ('pending', 'under_review');
