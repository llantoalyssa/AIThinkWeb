import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getUserRecentTAFs } from "@/server/actions/recents";
import { getStudentDashboardData } from "@/server/actions/student-dashboard";
import StudentDashboardPage from "./dashboard-client";

export default async function StudentDashboardRoute({
  params,
}: {

  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [shell, recents, dashboard] = await Promise.all([
    getStudentShell(),
    getUserRecentTAFs(),
    getStudentDashboardData(),
  ]);
  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`/dashboard/${shell.user.role}/${shell.user.id}`);
  }
  if (shell.user.id !== id) {
    redirect(`/dashboard/student/${shell.user.id}`);
  }

  return (
    <StudentDashboardPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
      initialHasGroup={shell.hasGroup}

      initialRecents={recents.success ? recents.data : undefined}
      initialDashboardData={dashboard.success ? dashboard.data : null}
    />
  );
}