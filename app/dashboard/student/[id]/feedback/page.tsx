// ============================================================
// Student feedback — SERVER entry point.
//
// The client page used to fire three queued server actions on mount
// (identity, the notification badge, the sidebar recents). All three are
// resolved in parallel HERE and ship with the first render, so opening this
// page costs zero data round trips.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getUserRecentTAFs } from "@/server/actions/recents";
import StudentFeedbackPage from "./feedback-client";

export default async function StudentFeedbackRoute({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [shell, recents] = await Promise.all([
    getStudentShell(),
    getUserRecentTAFs(),
  ]);

  // Access checks live here now (these used to run in the client).
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}`);
  }

  return (
    <StudentFeedbackPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      // On failure pass nothing so the child keeps its own fetch fallback.
      initialRecents={recents.success ? recents.data : undefined}
    />
  );
}
