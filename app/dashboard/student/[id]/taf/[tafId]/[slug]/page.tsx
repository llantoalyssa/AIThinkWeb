import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getTopicAbstractById } from "@/server/actions/topic-abstracts";
import { hasTAFGroupSubmissions } from "@/server/actions/group-submissions";
import { getUserRecentTAFs } from "@/server/actions/recents";
import StudentTafEditorPage from "./taf-editor-client";

export default async function StudentTafEditorRoute({
  params,
}: {

  params: Promise<{ id: string; tafId: string; slug: string }>;
}) {
  const { id, tafId } = await params;
  const isNew = tafId === "new";
  const [shell, recents, tafResult, subResult] = await Promise.all([
    getStudentShell(),
    getUserRecentTAFs(),
    isNew ? Promise.resolve(null) : getTopicAbstractById(tafId),
    isNew ? Promise.resolve(null) : hasTAFGroupSubmissions(tafId),
  ]);
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}/taf/${tafId}`);
  }
  let disableAnalyze = false;
  let submissionUrl: string | undefined;
  let submissionStatus: string | undefined;
  if (subResult && subResult.success && subResult.hasSubmissions) {
    disableAnalyze = true;
    if (subResult.submissionId && subResult.groupSlug) {
      submissionUrl = `/dashboard/student/${id}/group/${subResult.groupSlug}/submission/${subResult.submissionId}`;
    }
    submissionStatus = subResult.status;
  }

  return (
    <StudentTafEditorPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      initialTaf={tafResult && tafResult.success ? tafResult.data : undefined}
      initialDisableAnalyze={disableAnalyze}
      initialSubmissionUrl={submissionUrl}
      initialSubmissionStatus={submissionStatus}
      initialRecents={recents.success ? recents.data : undefined}
    />
  );
}