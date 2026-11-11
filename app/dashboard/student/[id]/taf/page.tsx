import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getStudentTopicAbstracts } from "@/server/actions/topic-abstracts";
import { getUserRecentTAFs } from "@/server/actions/recents";
import TafPageClient from "./taf-client";

export default async function StudentTafPage({
  params,
}: {

  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [shell, tafs, recents] = await Promise.all([
    getStudentShell(),
    getStudentTopicAbstracts(),
    getUserRecentTAFs(),
  ]);
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