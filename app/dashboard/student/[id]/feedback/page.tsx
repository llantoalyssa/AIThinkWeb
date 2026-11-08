

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
