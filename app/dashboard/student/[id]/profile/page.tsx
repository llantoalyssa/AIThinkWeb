// ============================================================
// Student profile settings — SERVER entry point.
//
// The client page used to fetch identity and then the notification badge, two
// queued server actions in a row. Both are resolved HERE and ship with the
// first render, so opening this page costs zero data round trips.
//
// Note the guards are deliberately the same as before: this route checked the
// role, not the URL id.
// ============================================================

import { redirect } from "next/navigation";
import { getStudentShell } from "@/server/actions/shell-data";
import { rolePath } from "@/lib/constants";
import StudentProfileSettingsPage from "./profile-client";

export default async function StudentProfileRoute() {
  const shell = await getStudentShell();

  if (!shell.success) redirect("/login");
  if (shell.user.role !== "student") {
    redirect(`${rolePath(shell.user.role)}/${shell.user.id}`);
  }

  return (
    <StudentProfileSettingsPage
      initialUser={shell.user}
      initialUnreadCount={shell.unreadCount}
    />
  );
}
