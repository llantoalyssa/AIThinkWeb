// ============================================================
// Student dashboard (home) — SERVER entry point.
//
// Everything this page shows is fetched HERE, in parallel, and ships
// with the first render: identity, advisory-group membership, the
// notification badge, the sidebar recents and the stats dashboard.
//
// It used to be a client page that fired three separate server actions
// on mount (the shell + one fetch inside each of two child components).
// Server actions are queued, so those ran one after another — three
// round trips between the click and the finished page. They are now all
// resolved server-side, so navigating here costs zero data round trips.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { getUserRecentTAFs } from "@/server/actions/recents";
import { getStudentDashboardData } from "@/server/actions/student-dashboard";
import StudentDashboardPage from "./dashboard-client";

export default async function StudentDashboardRoute({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // One auth check + the page's independent queries, all in parallel
  // server-side — where each is a short DB hop rather than a browser
  // round trip queued behind the next one.
  const [shell, recents, dashboard] = await Promise.all([
    getStudentShell(),
    getUserRecentTAFs(),
    getStudentDashboardData(),
  ]);

  // The identity/role/URL-id guards that used to run in the client.
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
      // On failure pass nothing so the child keeps its own fetch fallback.
      initialRecents={recents.success ? recents.data : undefined}
      initialDashboardData={dashboard.success ? dashboard.data : null}
    />
  );
}
