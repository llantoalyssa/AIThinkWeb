// ============================================================
// Student advisory-group detail — SERVER entry point.
//
// This was the heaviest student navigation after the TAF page: the client
// fired SIX server actions on mount (identity, group-by-slug, member roster,
// submissions, the notification badge and the sidebar recents). Server
// actions are queued, so they ran one after another.
//
// Now: the shell, the group lookup and the recents are fetched in parallel
// here, and the roster + submissions (which need the group id) in a second
// parallel wave — all server-side DB hops rather than browser round trips.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import {
  getStudentGroupBySlug,
  getStudentGroupMembers,
} from "@/server/actions/advisory-groups";
import { getMyGroupSubmissions } from "@/server/actions/group-submissions";
import { getUserRecentTAFs } from "@/server/actions/recents";
import StudentGroupDetailPage from "./group-detail-client";

export default async function StudentGroupDetailRoute({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  const [shell, groupResult, recents] = await Promise.all([
    getStudentShell(),
    getStudentGroupBySlug(slug),
    getUserRecentTAFs(),
  ]);

  // Access checks live here now (these used to run in the client).
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}/group/${slug}`);
  }
  // Unknown / not-a-member group: back to the group entry route.
  if (!groupResult.success) {
    redirect(`/dashboard/student/${id}/group`);
  }

  // The roster and the submissions list both key off the group id, so they
  // form a second parallel wave.
  const groupId = groupResult.data.groupId;
  const [members, submissions] = await Promise.all([
    getStudentGroupMembers(groupId),
    getMyGroupSubmissions(groupId),
  ]);

  return (
    <StudentGroupDetailPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      initialGroup={groupResult.data}
      initialMembers={members.success ? members.data : []}
      initialSubmissions={submissions.success ? submissions.data : []}
      // On failure pass nothing so the child keeps its own fetch fallback.
      initialRecents={recents.success ? recents.data : undefined}
    />
  );
}
