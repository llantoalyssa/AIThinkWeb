-- ============================================================
-- 051: audit trail
--
-- One append-only row per notable action, rendered on the Department
-- console's "Audit Trail" page.
--
-- Deliberate design choices:
--   * ACTOR details are DENORMALISED (email/name/role) so a row stays
--     readable after the account is renamed or deleted. actor_id keeps the
--     link while the account exists (ON DELETE SET NULL).
--   * `action` is free TEXT with a `category` alongside it, so new event
--     types need no migration — add a label to lib/audit.ts and log it.
--   * `entity_label` snapshots what was affected (TAF title, group name)
--     because the entity itself may be gone by the time anyone reads this.
--   * No INSERT/UPDATE/DELETE policies: writes go through the service role
--     from server actions, so nobody — including a department account — can
--     rewrite history. Department accounts can only SELECT.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Who did it (nullable: the account may be removed later).
    actor_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_name TEXT,
    actor_role TEXT,
    -- What happened.
    action TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    -- What it happened to.
    entity_type TEXT,
    entity_id UUID,
    entity_label TEXT,
    -- Human-readable summary + room for anything extra.
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category
    ON public.audit_logs (category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Read-only for department accounts; everyone else sees nothing.
DROP POLICY IF EXISTS audit_logs_department_select ON public.audit_logs;
CREATE POLICY audit_logs_department_select ON public.audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('department', 'admin')
        )
    );

-- Fast "recent activity" reads for the console.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_action
    ON public.audit_logs (created_at DESC, action);
