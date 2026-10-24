// ============================================================
// Student TAF editor route — SERVER entry point.
//
// The client page used to fire SIX queued server actions on mount
// (identity, the TAF record, the submitted-to-group check, the notification
// badge, the sidebar recents — plus the editor component's own TAF load).
// Everything except the editor's analysis-version lookup is now resolved
// here, in parallel, and ships with the first render.
//
// The "track this visit in recents" write stays in the client as a
// fire-and-forget effect, because it used to sit AWAITED in front of the
// first paint.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getTopicAbstractById } from "@/server/actions/topic-abstracts";
import { hasTAFGroupSubmissions } from "@/server/actions/group-submissions";
import { getUserRecentTAFs } from "@/server/actions/recents";
import StudentTafEditorPage from "./taf-editor-client";

export default async function StudentTafEditorRoute({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; tafId: string; slug: string }>;
}) {
  const { id, tafId } = await params;
  const isNew = tafId === "new";

  // One auth check + the page's independent queries, all in parallel
  // server-side. On the "new TAF" route there is no existing record to load.
  const [shell, recents, tafResult, subResult] = await Promise.all([
    getStudentShell(),
    getUserRecentTAFs(),
    isNew ? Promise.resolve(null) : getTopicAbstractById(tafId),
    isNew ? Promise.resolve(null) : hasTAFGroupSubmissions(tafId),
  ]);

  // Access checks live here now (these used to run in the client).
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}/taf/${tafId}`);
  }

  // Has this TAF been submitted to a group? If so, analysis/editing is locked
  // and the "View Submission" link is offered — same rules as before.
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
      // On a failed lookup pass nothing so the editor keeps its own fetch and
      // its existing "could not load" handling (toast + back to the list).
      initialTaf={tafResult && tafResult.success ? tafResult.data : undefined}
      initialDisableAnalyze={disableAnalyze}
      initialSubmissionUrl={submissionUrl}
      initialSubmissionStatus={submissionStatus}
      initialRecents={recents.success ? recents.data : undefined}
    />
  );
}
