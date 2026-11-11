"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { notify } from "@/server/actions/approval-workflow";
import { createAdminClient } from "@/server/supabase/admin";

// ============================================================
// Submission annotations — Google-Docs-style threaded comments
// anchored to sections of a submitted TAF.
//
// Visibility follows the SAME roadmap as the approval workflow:
//  - the student (submitter) sees and can reply to all threads,
//  - the adviser can comment from the start,
//  - associate_dean / dean / vcrdes can only see & comment once
//    the TAF has been routed to them (current_approver_role or
//    fully approved),
//  - the department can see & comment on ANY submission (it is the
//    optional approver that may act on any pending step, at any time).
// Each thread is scoped to one counterparty via `with_role`, so
// the student has separate annotation threads per approver, and
// each approver only sees their own.
// ============================================================

export type AnnotationFieldKey =
  | "proposedTitle"
  | "background"
  | "objectives"
  | "literatureReview"
  | "methodology"
  | "referenceList";

export type Annotation = {
  id: string;
  submissionId: string;
  fieldKey: AnnotationFieldKey;
  textSnippet: string;
  parentId: string | null;
  withRole: string;
  authorId: string;
  authorRole: string;
  authorName: string;
  comment: string;
  resolved: boolean;
  createdAt: string;
  replies: Annotation[];
};

export type AnnotationsResult =
  | { success: true; data: Annotation[]; canComment: boolean }
  | { success: false; error: string };

export type AnnotationCreateResult =
  | { success: true; annotation: Annotation }
  | { success: false; error: string };

export type AnnotationActionResult =
  | { success: true }
  | { success: false; error: string };

// ── Routing/participant gate (mirrors submission-chat) ─────────────
// Returns which annotation threads (`with_role`) the user can access,
// plus whether they may actually COMMENT (participants only). Group-member
// students who are NOT the submitter get view-only access (canComment = false).
async function accessibleRoles(
  submissionId: string,
  userId: string,
  role: string,
): Promise<
  | { ok: true; roles: string[]; canComment: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("group_id, submitted_by, current_approver_role, approval_route, fully_approved_at")
    .eq("id", submissionId)
    .single();

  if (!sub) return { ok: false, error: "TAF has been routed." };

  const isStudent = sub.submitted_by === userId;
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("adviser_id, is_active")
    .eq("id", sub.group_id)
    .single();
  const isAdviser = !!group && group.adviser_id === userId;

  /**
   * ARCHIVED GROUP → comments do not exist for this submission: nothing is
   * returned and nothing can be created, for EVERY role (submitter, adviser,
   * associate dean, dean, VCRDES, department).
   *
   * Enforced here, in the one gate every annotation action calls, because the UI
   * flag alone is not a guarantee — a stale tab, a cached page or a direct action
   * call could still insert a comment into a closed group.
   *
   * `canComment: false` also blocks replies (replyToAnnotation uses this gate).
   */
  // Read the flag with the service role: an approver has no SELECT right on an
  // archived group, so the session read above can legitimately return no row —
  // which must not be mistaken for "not archived".
  let archived = (group as { is_active?: boolean } | null)?.is_active === false;
  if (!archived) {
    const admin = createAdminClient();
    if (admin) {
      const { data: g } = await admin
        .from("advisory_groups")
        .select("is_active")
        .eq("id", sub.group_id)
        .maybeSingle();
      archived = (g as { is_active?: boolean } | null)?.is_active === false;
    }
  }
  if (archived) {
    return { ok: true, roles: [], canComment: false };
  }

  const route = (sub.approval_route as string[]) || [];
  const involved = new Set<string>(["adviser", ...route]);
  if (sub.current_approver_role) involved.add(sub.current_approver_role);
  const approved = !!sub.fully_approved_at;

  if (isStudent) {
    // The submitter sees all counterparty threads and may comment.
    return { ok: true, roles: Array.from(involved), canComment: true };
  }
  if (isAdviser) {
    // The adviser participates from the start AND sees every thread
    // (their own + the routed approvers') so all reviewer comments are
    // mutually visible within the group.
    return { ok: true, roles: Array.from(involved), canComment: true };
  }
  if (role === "department") {
    // The DEPARTMENT is the OPTIONAL approver: it may act on any pending step at
    // any time, so it is a participant in EVERY submission and may comment on
    // it. Its thread key falls back to an accessible one (the `with_role` column
    // is CHECK-capped to the four chain roles — see createSubmissionAnnotation),
    // so its comments land on the student's thread with author_role
    // 'department' rather than inventing a fifth conversation.
    return { ok: true, roles: Array.from(involved), canComment: true };
  }
  if (["associate_dean", "dean", "vcrdes"].includes(role)) {
    if (involved.has(role) || approved)
      // Routed approver sees all threads too (mutual visibility of
      // everyone's comments on the submission), and may comment.
      return { ok: true, roles: Array.from(involved), canComment: true };
    return { ok: false, error: "This TAF has not been routed to you yet." };
  }

  // Not a participant — allow VIEW-ONLY for group-member students.
  if (role === "student") {
    const { data: membership } = await supabase
      .from("student_group_memberships")
      .select("id")
      .eq("student_id", userId)
      .eq("group_id", sub.group_id)
      .maybeSingle();
    if (membership) {
      // View all threads tied to the submission, but cannot comment.
      return { ok: true, roles: Array.from(new Set([...involved, ...route, "adviser"])), canComment: false };
    }
  }

  return { ok: false, error: "You are not a participant in this submission." };
}

// ── Profile helper ────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

function displayName(p: ProfileRow): string {
  return [p.first_name, p.middle_initial, p.last_name, p.suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "User";
}

// Notify the submitter and the group's adviser when a comment/reply is
// added, skipping each recipient when they are the author (so nobody gets
// notified about their own post).
async function notifyAdviserOfComment(
  submissionId: string,
  authorId: string,
  authorName: string,
  isReply: boolean,
) {
  try {
    const supabase = await createClient();
    const { data: sub } = await supabase
      .from("group_taf_submissions")
      .select("group_id, submitted_by")
      .eq("id", submissionId)
      .single();
    const groupId = sub?.group_id as string | undefined;
    const submitterId = sub?.submitted_by as string | undefined;

    const verb = isReply ? "replied to a comment" : "commented";
    const noun = isReply ? "a reply" : "a comment";
    const actorName = authorName || "Someone";

    // Notify the submitter (student) — unless they wrote it themselves.
    if (submitterId && submitterId !== authorId) {
      await notify(
        submitterId,
        submissionId,
        "new_comment",
        `${actorName} ${verb} on your submitted TAF.`,
      );
    }

    // Notify the group's adviser — unless they wrote it themselves.
    if (groupId) {
      const { data: group } = await supabase
        .from("advisory_groups")
        .select("adviser_id")
        .eq("id", groupId)
        .single();
      const adviserId = group?.adviser_id as string | undefined;
      if (adviserId && adviserId !== authorId) {
        await notify(
          adviserId,
          submissionId,
          "new_comment",
          `${actorName} added ${noun} on a submitted TAF.`,
        );
      }
    }
  } catch (err) {
    console.error("[annotations] Failed to notify:", err);
  }
}

// ── Get annotations (threads) visible to the user ─────────────────

export async function getSubmissionAnnotations(
  submissionId: string,
): Promise<AnnotationsResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };

  const canComment = roles.canComment;

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("submission_annotations")
    .select("id, submission_id, field_key, text_snippet, parent_id, with_role, author_id, author_role, comment, resolved_at, created_at")
    .eq("submission_id", submissionId)
    .in("with_role", roles.roles)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[annotations] Failed to load:", error);
    return { success: false, error: "Failed to load annotations." };
  }

  // Author names
  const authorIds = Array.from(
    new Set((rows || []).map((r) => r.author_id as string)),
  );
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, middle_initial, last_name, suffix")
        .in("id", authorIds)
    : { data: [] };
  const nameMap = new Map<string, ProfileRow>();
  for (const p of (profiles || []) as ProfileRow[]) nameMap.set(p.id, p);

  const full: Annotation[] = (rows || []).map((r) => {
    const author = nameMap.get(r.author_id as string);
    return {
      id: r.id as string,
      submissionId: r.submission_id as string,
      fieldKey: r.field_key as AnnotationFieldKey,
      textSnippet: (r.text_snippet as string) || "",
      parentId: (r.parent_id as string) || null,
      withRole: r.with_role as string,
      authorId: r.author_id as string,
      authorRole: r.author_role as string,
      authorName: author ? displayName(author) : "User",
      comment: r.comment as string,
      resolved: !!r.resolved_at,
      createdAt: r.created_at as string,
      replies: [],
    };
  });

  // Build threads (roots first, then attach replies)
  const roots: Annotation[] = [];
  const byId = new Map<string, Annotation>();
  for (const a of full) byId.set(a.id, a);
  for (const a of full) {
    if (a.parentId && byId.has(a.parentId)) {
      byId.get(a.parentId)!.replies.push(a);
    } else {
      roots.push(a);
    }
  }

  return { success: true, data: roots, canComment };
}

// ── Create a new comment thread ───────────────────────────────────

export async function createSubmissionAnnotation(
  submissionId: string,
  input: {
    fieldKey: AnnotationFieldKey;
    textSnippet: string;
    comment: string;
  },
): Promise<AnnotationCreateResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const clean = input.comment.trim();
  if (!clean) return { success: false, error: "Comment cannot be empty." };
  if (input.textSnippet.length > 500)
    return { success: false, error: "Highlighted text is too long." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };
  if (!roles.canComment)
    return { success: false, error: "You can view comments here but not add them." };

  const supabase = await createClient();

  // A commenter picks the counterparty thread. Default: adviser.
  let withRole: string = user.role;
  if (user.role === "student") withRole = roles.roles[0] || "adviser";
  if (!["adviser", "associate_dean", "dean", "vcrdes"].includes(withRole))
    withRole = "adviser";
  // Ensure the chosen role is actually accessible
  if (!roles.roles.includes(withRole)) withRole = roles.roles[0] || "adviser";

  // The author's display name only decorates the RESPONSE, so it must not sit
  // on the critical path behind the insert — run both at once.
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase
      .from("submission_annotations")
      .insert({
        submission_id: submissionId,
        field_key: input.fieldKey,
        text_snippet: input.textSnippet,
        parent_id: null,
        with_role: withRole,
        author_id: user.id,
        author_role: user.role,
        comment: clean,
      })
      .select("id, submission_id, field_key, text_snippet, parent_id, with_role, author_id, author_role, comment, resolved_at, created_at")
      .single(),
    supabase
      .from("profiles")
      .select("first_name, middle_initial, last_name, suffix")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (error || !data) {
    console.error("[annotations] Failed to create:", error);
    return { success: false, error: "Failed to add comment." };
  }

  const authorName = profile ? displayName(profile as ProfileRow) : user.firstName || "User";

  // Notify the adviser (skipped for the adviser's own comment).
  void notifyAdviserOfComment(submissionId, user.id, authorName, false);

  return {
    success: true,
    annotation: {
      id: data.id as string,
      submissionId: data.submission_id as string,
      fieldKey: data.field_key as AnnotationFieldKey,
      textSnippet: (data.text_snippet as string) || "",
      parentId: null,
      withRole: data.with_role as string,
      authorId: data.author_id as string,
      authorRole: data.author_role as string,
      authorName,
      comment: data.comment as string,
      resolved: !!data.resolved_at,
      createdAt: data.created_at as string,
      replies: [],
    },
  };
}

// ── Reply to a thread ─────────────────────────────────────────────

export async function replyToAnnotation(
  submissionId: string,
  threadId: string,
  comment: string,
): Promise<AnnotationCreateResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const clean = comment.trim();
  if (!clean) return { success: false, error: "Reply cannot be empty." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };
  if (!roles.canComment)
    return { success: false, error: "You can view comments here but not reply." };

  const supabase = await createClient();

  // Find the thread root to copy its with_role + snippet
  const { data: thread } = await supabase
    .from("submission_annotations")
    .select("id, with_role, field_key, text_snippet")
    .eq("id", threadId)
    .single();

  if (!thread || !roles.roles.includes(thread.with_role)) {
    return { success: false, error: "This annotation thread is not visible to you." };
  }

  const { data, error } = await supabase
    .from("submission_annotations")
    .insert({
      submission_id: submissionId,
      field_key: thread.field_key,
      text_snippet: thread.text_snippet,
      parent_id: threadId,
      with_role: thread.with_role,
      author_id: user.id,
      author_role: user.role,
      comment: clean,
    })
    .select("id, submission_id, field_key, text_snippet, parent_id, with_role, author_id, author_role, comment, resolved_at, created_at")
    .single();

  if (error || !data) {
    console.error("[annotations] Failed to reply:", error);
    return { success: false, error: "Failed to add reply." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, middle_initial, last_name, suffix")
    .eq("id", user.id)
    .maybeSingle();
  const replyAuthorName = profile ? displayName(profile as ProfileRow) : user.firstName || "User";

  // Notify the adviser (skipped for the adviser's own reply).
  void notifyAdviserOfComment(submissionId, user.id, replyAuthorName, true);

  return {
    success: true,
    annotation: {
      id: data.id as string,
      submissionId: data.submission_id as string,
      fieldKey: data.field_key as AnnotationFieldKey,
      textSnippet: (data.text_snippet as string) || "",
      parentId: null, // replies are nested in UI, not returned as roots
      withRole: data.with_role as string,
      authorId: data.author_id as string,
      authorRole: data.author_role as string,
      authorName: replyAuthorName,
      comment: data.comment as string,
      resolved: !!data.resolved_at,
      createdAt: data.created_at as string,
      replies: [],
    },
  };
}

// ── Edit an annotation's / reply's comment text ────────────────────

export async function updateAnnotation(
  submissionId: string,
  annotationId: string,
  comment: string,
): Promise<AnnotationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const clean = comment.trim();
  if (!clean) return { success: false, error: "Comment cannot be empty." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("submission_annotations")
    .select("author_id")
    .eq("id", annotationId)
    .single();

  if (!row) return { success: false, error: "Annotation not found." };
  if (row.author_id !== user.id) {
    return { success: false, error: "Only the author can edit this." };
  }

  const { error } = await supabase
    .from("submission_annotations")
    .update({ comment: clean })
    .eq("id", annotationId);

  if (error) {
    console.error("[annotations] Failed to edit:", error);
    return { success: false, error: "Failed to update annotation." };
  }
  return { success: true };
}

// ── Delete an annotation or reply (author only) ────────────────────
// Deleting a thread root also cascades-deletes its replies (parent_id
// FK ON DELETE CASCADE).

export async function deleteAnnotation(
  submissionId: string,
  annotationId: string,
): Promise<AnnotationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("submission_annotations")
    .select("author_id")
    .eq("id", annotationId)
    .single();

  if (!row) return { success: false, error: "Annotation not found." };
  if (row.author_id !== user.id) {
    return { success: false, error: "Only the author can delete this." };
  }

  const { error } = await supabase
    .from("submission_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) {
    console.error("[annotations] Failed to delete:", error);
    return { success: false, error: "Failed to delete annotation." };
  }
  return { success: true };
}

// ── Resolve a thread (toggle) ─────────────────────────────────────

export async function resolveAnnotation(
  submissionId: string,
  threadId: string,
  resolved: boolean,
): Promise<AnnotationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const roles = await accessibleRoles(submissionId, user.id, user.role);
  if (!roles.ok) return { success: false, error: roles.error };

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("submission_annotations")
    .select("id, author_id, with_role")
    .eq("id", threadId)
    .single();

  if (!thread) return { success: false, error: "Annotation not found." };
  // Only the thread author can resolve/unresolve.
  if (thread.author_id !== user.id) {
    return { success: false, error: "Only the thread author can resolve this." };
  }

  const { error } = await supabase
    .from("submission_annotations")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", threadId);

  if (error) {
    console.error("[annotations] Failed to resolve:", error);
    return { success: false, error: "Failed to update annotation." };
  }
  return { success: true };
}