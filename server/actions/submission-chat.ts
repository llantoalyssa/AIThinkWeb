"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";

type ApproverRole = "associate_dean" | "dean" | "vcrdes";
export type ChatMessage = {
  id: string;
  submissionId: string;
  senderId: string;
  senderName: string;
  senderRole: "student" | "adviser" | "associate_dean" | "dean" | "vcrdes";
  message: string;
  createdAt: string;
};

export type ChatParticipant = {
  id: string;
  name: string;
  role: "student" | "adviser" | "associate_dean" | "dean" | "vcrdes";
  srCode?: string;
};
export type ChatConversation = {
  role: "adviser" | "associate_dean" | "dean" | "vcrdes";

  label: string;

  available: boolean;

  unread: number;
};

export type GetChatResult =
  | {
      success: true;
      data: {
        messages: ChatMessage[];

        other: ChatParticipant | null;

        me: ChatParticipant;

        submissionId: string;

        withRole: string;
      };
    }
  | { success: false; error: string };

export type SendChatResult =
  | { success: true; message: ChatMessage }
  | { success: false; error: string };

export type ConversationsResult =
  | { success: true; data: ChatConversation[] }
  | { success: false; error: string };
type ProfileRow = {
  id: string;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  sr_code?: string | null;
  role?: string | null;
};

function displayName(p: ProfileRow): string {
  return [p.first_name, p.middle_initial, p.last_name, p.suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "User";
}
async function getSubmissionForParticipant(
  submissionId: string,
  userId: string,
  role: string,
): Promise<
  | { ok: true; submission: { group_id: string; submitted_by: string; current_approver_role: string | null; approval_route: string[] | null } }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("group_taf_submissions")
    .select("group_id, submitted_by, current_approver_role, approval_route")
    .eq("id", submissionId)
    .single();

  if (!sub) {
    return { ok: false, error: "Submission not found." };
  }

  const isStudent = sub.submitted_by === userId;
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("adviser_id")
    .eq("id", sub.group_id)
    .single();
  const isAdviser = !!group && group.adviser_id === userId;
  const approverRoles: string[] = ["associate_dean", "dean", "vcrdes"];
  const route = (sub.approval_route as string[]) || [];
  const hasSeenRoute = route.includes(role);
  const isCurrentApprover = sub.current_approver_role === role;
  const isApproverRole = approverRoles.includes(role) && (hasSeenRoute || isCurrentApprover);

  if (!isStudent && !isAdviser && !isApproverRole) {
    return {
      ok: false,
      error: "You are not a participant in this submission's conversation.",
    };
  }

  return { ok: true, submission: sub };
}
export async function getSubmissionChat(
  submissionId: string,
  withRole?: string,
): Promise<GetChatResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const access = await getSubmissionForParticipant(
    submissionId,
    user.id,
    user.role,
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }
  const isStudent = access.submission.submitted_by === user.id;
  const roleList = ["adviser", "associate_dean", "dean", "vcrdes"];
  let conversationRole = (withRole || "adviser") as string;
  if (!roleList.includes(conversationRole)) conversationRole = "adviser";
  if (!isStudent && conversationRole !== user.role) {
    return { success: false, error: "You can only view your own conversation with the student." };
  }
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id, first_name, middle_initial, last_name, suffix, sr_code, role")
    .eq("id", user.id)
    .maybeSingle();
  let otherId: string | null = null;
  let otherRole: ChatParticipant["role"] = "student";

  if (isStudent) {

    if (conversationRole === "adviser") {
      otherId = await getGroupAdviserId(access.submission.group_id);
      otherRole = "adviser";
    } else {
      otherId = await findActiveUserForRole(conversationRole as Exclude<ApproverRole, "adviser">);
      otherRole = conversationRole as ChatParticipant["role"];
    }
  } else {

    otherId = access.submission.submitted_by;
    otherRole = "student";
  }

  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("id, first_name, middle_initial, last_name, suffix, sr_code, role")
    .eq("id", otherId ?? "")
    .maybeSingle();
  const { data: rows, error: msgErr } = await supabase
    .from("submission_chat_messages")
    .select("id, submission_id, sender_id, message, created_at, with_role")
    .eq("submission_id", submissionId)
    .eq("with_role", conversationRole)
    .order("created_at", { ascending: true });

  if (msgErr) {
    console.error("[submission-chat] Failed to load messages:", msgErr);
    return { success: false, error: "Failed to load messages." };
  }
  const senderIds = Array.from(
    new Set((rows || []).map((r: any) => r.sender_id as string)),
  );
  const { data: senderProfiles } = senderIds.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, middle_initial, last_name, suffix, sr_code, role")
        .in("id", senderIds)
    : { data: [] };

  const nameMap = new Map<string, ProfileRow>();
  for (const p of (senderProfiles || []) as ProfileRow[]) {
    nameMap.set(p.id, p);
  }

  const messages: ChatMessage[] = (rows || []).map((r: any) => {
    const profile = nameMap.get(r.sender_id as string);
    const isMine = r.sender_id === user.id;
    return {
      id: r.id as string,
      submissionId: r.submission_id as string,
      senderId: r.sender_id as string,
      senderName: profile ? displayName(profile) : "User",
      senderRole: isMine
        ? (user.role as ChatMessage["senderRole"])
        : ((profile?.role as ChatMessage["senderRole"]) || "student"),
      message: r.message as string,
      createdAt: r.created_at as string,
    };
  });

  const me: ChatParticipant = {
    id: user.id,
    name: myProfile ? displayName(myProfile as ProfileRow) : user.firstName || "User",
    role: user.role as ChatParticipant["role"],
    srCode: (myProfile as ProfileRow | null)?.sr_code || user.srCode,
  };

  const other: ChatParticipant | null = otherProfile
    ? {
        id: (otherProfile as ProfileRow).id,
        name: displayName(otherProfile as ProfileRow),
        role: otherRole as ChatParticipant["role"],
        srCode: (otherProfile as ProfileRow).sr_code || undefined,
      }
    : null;

  return {
    success: true,
    data: { messages, other, me, submissionId, withRole: conversationRole },
  };
}
export async function getChatConversations(
  submissionId: string,
): Promise<ConversationsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const access = await getSubmissionForParticipant(
    submissionId,
    user.id,
    user.role,
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const isStudent = access.submission.submitted_by === user.id;
  const route = access.submission.approval_route as string[] | null;
  const currentRole = access.submission.current_approver_role;
  const involved = new Set<string>(["adviser", ...(route || [])]);
  if (currentRole) involved.add(currentRole);

  const labels: Record<string, string> = {
    adviser: "Adviser",
    associate_dean: "Associate Dean",
    dean: "Dean",
    vcrdes: "VCRDES",
  };

  if (isStudent) {

    const roles = ["adviser", "associate_dean", "dean", "vcrdes"] as const;
    const convos: ChatConversation[] = [];
    for (const role of roles) {
      const { count } = await supabase
        .from("submission_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", submissionId)
        .eq("with_role", role);
      convos.push({
        role,
        label: labels[role],
        available: involved.has(role),
        unread: 0,
      });
      void count;
    }
    return { success: true, data: convos };
  }
  const { count } = await supabase
    .from("submission_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("with_role", user.role);
  return {
    success: true,
    data: [
      {
        role: user.role as ChatConversation["role"],
        label: labels[user.role] || "Conversation",
        available: true,
        unread: 0,
      },
    ],
  };
}
export async function sendSubmissionChatMessage(
  submissionId: string,
  message: string,
  withRole?: string,
): Promise<SendChatResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const clean = message.trim();
  if (!clean) {
    return { success: false, error: "Message cannot be empty." };
  }
  if (clean.length > 2000) {
    return { success: false, error: "Message is too long (max 2000 characters)." };
  }

  const supabase = await createClient();

  const access = await getSubmissionForParticipant(
    submissionId,
    user.id,
    user.role,
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }
  const isStudent = access.submission.submitted_by === user.id;
  const roleList = ["adviser", "associate_dean", "dean", "vcrdes"];
  let conversationRole = (withRole || "adviser") as string;
  if (!roleList.includes(conversationRole)) conversationRole = "adviser";
  if (!isStudent) conversationRole = user.role;

  const { data, error } = await supabase
    .from("submission_chat_messages")
    .insert({
      submission_id: submissionId,
      sender_id: user.id,
      message: clean,
      with_role: conversationRole,
    })
    .select("id, submission_id, sender_id, message, created_at")
    .single();

  if (error || !data) {
    console.error("[submission-chat] Failed to send message:", error);
    return { success: false, error: "Failed to send message." };
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("first_name, middle_initial, last_name, suffix, sr_code, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    success: true,
    message: {
      id: data.id as string,
      submissionId: data.submission_id as string,
      senderId: data.sender_id as string,
      senderName: myProfile ? displayName(myProfile as ProfileRow) : user.firstName || "User",
      senderRole: user.role as ChatMessage["senderRole"],
      message: data.message as string,
      createdAt: data.created_at as string,
    },
  };
}
async function getGroupAdviserId(groupId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advisory_groups")
    .select("adviser_id")
    .eq("id", groupId)
    .maybeSingle();
  return (data?.adviser_id as string) ?? null;
}
async function findActiveUserForRole(
  role: ApproverRole,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", role)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string) ?? null;
}