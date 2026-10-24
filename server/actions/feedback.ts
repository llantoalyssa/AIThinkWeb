"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { getCurrentUser } from "@/server/actions/auth";
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
  try {
    const admin = createAdminClient();
    if (admin) {
      const { data: deptAccounts } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "department")
        .eq("is_active", true);

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
          console.error("[feedback] department notify failed:", notifyErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[feedback] department notify threw:", err);
  }

  return { success: true, message: "Thank you! Your feedback has been submitted." };
}
export async function listAllFeedback(): Promise<FeedbackListResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can view feedback." };
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
  return { success: true, message: "Feedback deleted." };
}