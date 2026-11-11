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