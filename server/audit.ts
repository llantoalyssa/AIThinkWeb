// ============================================================
// Audit trail — server-side logging + reads.
//
// Writing is BEST-EFFORT and must never break the action it describes: every
// insert is wrapped, failures only reach the server log. That also means the
// app keeps working before migration 051 has been applied.
//
// Reads are performed with the CALLER'S session client, so the RLS policy on
// audit_logs (department/admin SELECT only) is what actually protects the
// data — the role check here just produces a friendly message.
// ============================================================

import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";
import { ACTION_CATEGORY, type AuditAction, type AuditCategory } from "@/lib/audit";

// NOTE: getCurrentUser is imported DYNAMICALLY inside the functions below.
// server/actions/auth.ts imports logAudit from this module, so a static import
// of auth here would create a cycle — a dynamic import keeps both sides safe.

/** Who performed the action. */
export type AuditActor = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export type LogAuditInput = {
  action: AuditAction | string;
  category?: AuditCategory;
  /** Human-readable one-liner shown in the Description column. */
  description?: string;
  entityType?: string;
  entityId?: string | null;
  /** Snapshot of what was affected (survives the entity being deleted). */
  entityLabel?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * Explicit actor. Pass it when the session isn't readable in this context
   * (the OAuth callback sets cookies on the RESPONSE, so the request cookies
   * don't have it yet) or when the caller already resolved the user and a
   * second lookup would be a wasted round trip.
   */
  actor?: AuditActor;
};

function actorName(u: {
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

/**
 * Record one audit event. Never throws — a logging failure must not fail the
 * user's action (or, worse, roll it back).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    let actor = input.actor ?? null;

    /**
     * Fill in the NAME, not just the id.
     *
     * Several call sites pass `actor: { id, email, role }` because they already
     * resolved the session — which left `actor_name` NULL, so the Audit Trail
     * showed an event with no person attached ("data is saved but the name is
     * not"). Resolve the rest here instead of asking every caller to remember.
     */
    if (!actor || !actor.name) {
      const { getCurrentUser } = await import("@/server/actions/auth");
      const user = await getCurrentUser().catch(() => null);
      if (user) {
        actor = {
          id: actor?.id ?? user.id,
          email: actor?.email ?? user.email,
          name: actor?.name ?? actorName(user),
          role: actor?.role ?? user.role,
        };
      }
    }

    /**
     * Last resort for an explicit actor with no session (the recovery-link
     * password flow): read the name off the profile row.
     */
    if (actor && !actor.name && (actor.id || actor.email)) {
      const lookup = createAdminClient();
      if (lookup) {
        const query = lookup
          .from("profiles")
          .select("first_name, last_name");
        const { data } = await (actor.id
          ? query.eq("id", actor.id).maybeSingle()
          : query.eq("email", actor.email as string).maybeSingle());
        const found = data as
          | { first_name?: string | null; last_name?: string | null }
          | null;
        const full = actorName({
          firstName: found?.first_name,
          lastName: found?.last_name,
        });
        if (full) actor = { ...actor, name: full };
      }
    }

    const action = input.action as AuditAction;
    const category =
      input.category ??
      (ACTION_CATEGORY as Record<string, AuditCategory>)[action] ??
      "general";

    const admin = createAdminClient();
    if (!admin) {
      // No service-role key configured — logging is skipped, never fatal.
      console.error("[audit] service role key missing — event not recorded");
      return;
    }
    const { error } = await admin.from("audit_logs").insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      actor_name: actor?.name ?? null,
      actor_role: actor?.role ?? null,
      action,
      category,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      // 42P01 = table missing (migration 051 not applied yet) — expected until
      // the migration is pasted; anything else is a real problem.
      console.error(
        `[audit] could not log "${action}":`,
        error.code === "42P01"
          ? "audit_logs table not found — apply migration 051"
          : `${error.code ?? ""} ${error.message}`,
      );
    }
  } catch (err) {
    console.error("[audit] logging failed:", err);
  }
}

// ── Reads (Audit Trail page) ────────────────────────────────────────

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  entityType: string | null;
  entityLabel: string | null;
  description: string | null;
  createdAt: string;
};

export type AuditLogQuery = {
  page?: number;
  perPage?: number;
  action?: string | null;
  category?: string | null;
  /** Free text over actor name / email / description / entity label. */
  search?: string | null;
  /** ISO date (inclusive) — filters on created_at. */
  from?: string | null;
  to?: string | null;
};

export type AuditLogPage =
  | {
      success: true;
      rows: AuditLogRow[];
      total: number;
      page: number;
      perPage: number;
    }
  | { success: false; error: string; needsMigration?: boolean };

export const AUDIT_PER_PAGE = 25;

export async function getAuditLogs(
  params: AuditLogQuery = {},
): Promise<AuditLogPage> {
  const { getCurrentUser } = await import("@/server/actions/auth");
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "department") {
    // PERMISSION-aware, not role-only: `pages.audit` is what migration 057 puts
    // on the SELECT policy of public.audit_logs, and this guard tests the SAME
    // key with the SAME reader (override → role default → false), so a caller
    // can never pass here and be filtered to zero rows by RLS — or vice versa.
    // The department keeps its access through the role shortcut above, which is
    // free: `pages.audit` is one of its defaults.
    //
    // Imported dynamically because this module is the writer permissions.ts
    // depends on (logAudit); a static import would close that cycle.
    const { getGrantedPermissions } = await import("@/server/actions/permissions");
    const granted = await getGrantedPermissions(user.id);
    if (!granted.includes("pages.audit")) {
      return { success: false, error: "Only department accounts can view the audit trail." };
    }
  }

  const perPage = Math.min(Math.max(params.perPage ?? AUDIT_PER_PAGE, 5), 100);
  const page = Math.max(params.page ?? 1, 1);
  const fromIdx = (page - 1) * perPage;
  const toIdx = fromIdx + perPage - 1;

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, actor_email, actor_name, actor_role, action, category, entity_type, entity_label, description, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (params.action) query = query.eq("action", params.action);
  if (params.category) query = query.eq("category", params.category);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  const search = params.search?.trim();
  if (search) {
    // Commas and parentheses would break PostgREST's or() syntax.
    const safe = search.replace(/[,()*]/g, " ").trim();
    if (safe) {
      query = query.or(
        [
          `actor_email.ilike.%${safe}%`,
          `actor_name.ilike.%${safe}%`,
          `description.ilike.%${safe}%`,
          `entity_label.ilike.%${safe}%`,
        ].join(","),
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    const missing = error.code === "42P01";
    console.error("[audit] read failed:", error.code, error.message);
    return {
      success: false,
      needsMigration: missing,
      error: missing
        ? "The audit trail table does not exist yet — apply migration 051 in Supabase."
        : `Could not load the audit trail: ${error.message}`,
    };
  }

  const rows: AuditLogRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    actorEmail: (r.actor_email as string) ?? null,
    actorName: (r.actor_name as string) ?? null,
    actorRole: (r.actor_role as string) ?? null,
    action: r.action as string,
    category: (r.category as string) ?? "general",
    entityType: (r.entity_type as string) ?? null,
    entityLabel: (r.entity_label as string) ?? null,
    description: (r.description as string) ?? null,
    createdAt: r.created_at as string,
  }));

  return { success: true, rows, total: count ?? rows.length, page, perPage };
}

/**
 * The audit trail's most recent events, used as the page's first payload so
 * the table ships with the server render (no client fetch on open).
 */
export async function getRecentAuditLogs(limit = AUDIT_PER_PAGE) {
  return getAuditLogs({ page: 1, perPage: limit });
}
