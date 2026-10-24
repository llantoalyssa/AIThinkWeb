import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";
import { ACTION_CATEGORY, type AuditAction, type AuditCategory } from "@/lib/audit";
export type AuditActor = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export type LogAuditInput = {
  action: AuditAction | string;
  category?: AuditCategory;

  description?: string;
  entityType?: string;
  entityId?: string | null;

  entityLabel?: string | null;
  metadata?: Record<string, unknown>;
  actor?: AuditActor;
};

function actorName(u: {
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    let actor = input.actor ?? null;

    if (!actor) {
      const { getCurrentUser } = await import("@/server/actions/auth");
      const user = await getCurrentUser();
      if (user) {
        actor = {
          id: user.id,
          email: user.email,
          name: actorName(user),
          role: user.role,
        };
      }
    }

    const action = input.action as AuditAction;
    const category =
      input.category ??
      (ACTION_CATEGORY as Record<string, AuditCategory>)[action] ??
      "general";

    const admin = createAdminClient();
    if (!admin) {

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

  search?: string | null;

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
    return { success: false, error: "Only department accounts can view the audit trail." };
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
export async function getRecentAuditLogs(limit = AUDIT_PER_PAGE) {
  return getAuditLogs({ page: 1, perPage: limit });
}