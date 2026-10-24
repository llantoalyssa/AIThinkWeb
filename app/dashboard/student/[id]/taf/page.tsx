// ============================================================
// Student "Topic Abstract Form" list — SERVER entry point.
//
// Everything this page shows is fetched HERE, in parallel, and ships
// with the first render: identity, the notification badge, the TAF list
// and the sidebar recents.
//
// It used to be a client page that fired four separate server actions on
// mount — and because server actions are queued, those ran one after
// another. That made this the slowest navigation in the app (5 requests,
// ~3s before data appeared). Now it costs zero data round trips: the
// content arrives with the RSC payload for the route.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getStudentTopicAbstracts } from "@/server/actions/topic-abstracts";
import { getUserRecentTAFs } from "@/server/actions/recents";
import TafPageClient from "./taf-client";

export default async function StudentTafPage({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // One auth check + the page's independent queries, all in parallel
  // server-side — where each is a short DB hop, not a browser round trip.
  const [shell, tafs, recents] = await Promise.all([
    getStudentShell(),
    getStudentTopicAbstracts(),
    getUserRecentTAFs(),
  ]);

  // Access checks live here now (see middleware for the URL-id guard).
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}/taf`);
  }

  return (
    <TafPageClient
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      initialTafs={tafs.success ? tafs.data : []}
      initialRecents={recents.success ? recents.data : []}
    />
  );
}
