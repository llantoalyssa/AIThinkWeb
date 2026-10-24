// ============================================================
// Student submission review — SERVER entry point.
//
// The client page used to fire FOUR queued server actions on mount
// (identity, the submission record, the notification badge and the sidebar
// recents). They are fetched in parallel HERE instead, so the page renders
// complete on arrival with no data round trips.
//
// The 6-second live-status poll in the client is unchanged — that is an
// ongoing refresh, not mount work.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getSubmissionById } from "@/server/actions/group-submissions";
import { getUserRecentTAFs } from "@/server/actions/recents";
import StudentSubmissionViewPage from "./student-submission-client";

export default async function StudentSubmissionRoute({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; slug: string; submissionId: string }>;
}) {
  const { id, slug, submissionId } = await params;

  const [shell, submission, recents] = await Promise.all([
    getStudentShell(),
    getSubmissionById(submissionId),
    getUserRecentTAFs(),
  ]);

  // Access checks live here now (these used to run in the client).
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(
      `/dashboard/student/${shell.user.id}/group/${slug}/submission/${submissionId}`,
    );
  }

  return (
    <StudentSubmissionViewPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      // A failed lookup is handed down as an error so the client renders the
      // same "Submission not found" screen it always did.
      initialSubmission={submission.success ? submission.data : null}
      initialError={submission.success ? null : submission.error}
      // On failure pass nothing so the child keeps its own fetch fallback.
      initialRecents={recents.success ? recents.data : undefined}
    />
  );
}
