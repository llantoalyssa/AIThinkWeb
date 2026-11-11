"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { logAudit } from "@/server/audit";

// ============================================================
// System feedback — any authenticated user can submit a rating +
// description; the department can view / delete all feedback.
// ============================================================

export type FeedbackItem = {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  rating: number;
  description: string;
  createdAt: string;
};

export type SubmitFeedbackResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type FeedbackListResult =
  | { success: true; data: FeedbackItem[] }
  | { success: false; error: string };

// ── Submit feedback (any authenticated user) ─────────────────

export async function submitFeedback(input: {
  rating: number;
  description: string;
}): Promise<SubmitFeedbackResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be between 1 and 5." };
  }
  const description = (input.description || "").trim();
  if (description.length > 2000) {
    return { success: false, error: "Description is too long (max 2000 characters)." };
  }
  if (description && description.length < 10) {
    return { success: false, error: "Feedback must be at least 10 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("system_feedback").insert({
    user_id: user.id,
    rating,
    description,
  });

  if (error) {
    console.error("[feedback] submit failed:", error);
    return { success: false, error: "Failed to submit feedback. Please try again." };
  }

  // Notify every ACTIVE department account: feedback is what fills this role's
  // notification list (it is not in the approval chain, so it gets no routed
  // TAFs). Best-effort — a notification failure must never fail the user's
  // feedback. Uses the service-role client because a student has no INSERT
  // rights on approval_notifications.
  try {
    const admin = createAdminClient();
    if (admin) {
      // NULL is_active must count as active: `.eq("is_active", true)` excludes
      // NULL rows, so an account whose flag was never set would silently miss
      // every notification.
      const { data: deptAccounts } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "department")
        .or("is_active.is.null,is_active.eq.true");

      const recipients = (deptAccounts ?? [])
        .map((d) => d.id as string)
        .filter(Boolean);

      if (recipients.length > 0) {
        const who =
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email ||
          "A user";
        const preview =
          description.length > 120 ? `${description.slice(0, 117)}…` : description;

        const { error: notifyErr } = await admin
          .from("approval_notifications")
          .insert(
            recipients.map((recipientId) => ({
              user_id: recipientId,
              submission_id: null,
              type: "new_feedback",
              message: `${who} rated the system ${rating}/5${
                preview ? `: “${preview}”` : "."
              }`,
              read_at: null,
            })),
          );

        if (notifyErr) {
          // 23502 / 23514 = NOT NULL / CHECK violation → migration 052 has not
          // been applied to this project. Surfaced so the cause is obvious.
          console.error(
            "[feedback] department notify failed:",
            notifyErr.code === "23502" || notifyErr.code === "23514"
              ? `${notifyErr.message} — apply migration 052 (feedback notifications)`
              : `${notifyErr.code ?? ""} ${notifyErr.message}`,
          );
        }
      } else {
        console.warn("[feedback] no active department account to notify");
      }
    }
  } catch (err) {
    console.error("[feedback] department notify threw:", err);
  }

  return { success: true, message: "Thank you! Your feedback has been submitted." };
}

// ── List all feedback (department, or any role granted pages.feedback) ──

export async function listAllFeedback(): Promise<FeedbackListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  // PERMISSION-aware, not role-only. The department keeps exactly the access it
  // has today — its role shortcut is tested FIRST, so this cannot regress and
  // costs the department no extra query at all. Every OTHER role is allowed
  // only when its EFFECTIVE permissions include 'pages.feedback' (override →
  // role default → false, via the shared reader), which is what lets the one
  // associate dean the department console granted read this list.
  //
  // Deliberately the same test migration 056 puts on the SELECT policy of
  // public.system_feedback: a caller can never pass this guard and then be
  // silently filtered to zero rows by RLS, or vice versa.
  //
  // Nothing else widens: deleteFeedback below keeps its department-only guard,
  // and 'feedback.reply' stays a separate permission.
  if (user.role !== "department") {
    const granted = await getGrantedPermissions(user.id);
    if (!granted.includes("pages.feedback")) {
      return {
        success: false,
        error: "You do not have permission to view feedback.",
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_feedback")
    .select("id, user_id, rating, description, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[feedback] list failed:", error);
    return { success: false, error: "Failed to load feedback." };
  }

  const userIds = Array.from(new Set((data || []).map((r) => r.user_id as string)));
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, sr_code, role")
        .in("id", userIds)
    : { data: [] };

  const nameMap = new Map<
    string,
    { name: string; role: string }
  >();
  for (const p of (profiles || []) as Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
  }>) {
    nameMap.set(p.id, {
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
      role: p.role || "user",
    });
  }

  const items: FeedbackItem[] = (data || []).map((r) => {
    const meta = nameMap.get(r.user_id as string);
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userName: meta?.name || "Unknown",
      userRole: meta?.role || "user",
      rating: Number(r.rating) || 0,
      description: (r.description as string) || "",
      createdAt: r.created_at as string,
    };
  });

  return { success: true, data: items };
}

// ── Delete feedback (department only) ────────────────────────

export async function deleteFeedback(
  id: string,
): Promise<SubmitFeedbackResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can delete feedback." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("system_feedback").delete().eq("id", id);

  if (error) {
    console.error("[feedback] delete failed:", error);
    return { success: false, error: "Failed to delete feedback." };
  }
  await logAudit({
    action: "feedback_deleted",
    category: "deletion",
    entityType: "feedback",
    entityId: id,
    description: "Deleted a feedback entry from the inbox.",
    actor: { id: user.id, email: user.email, role: user.role },
  });

  return { success: true, message: "Feedback deleted." };
}