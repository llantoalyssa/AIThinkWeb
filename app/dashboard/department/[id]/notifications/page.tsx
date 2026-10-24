import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyNotifications } from "@/server/actions/approval-workflow";
import { rolePath } from "@/lib/constants";
import DepartmentNotificationsPage from "./notifications-client";

export default async function DepartmentNotificationsRoute() {
  const [user, notifs] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
  ]);

  if (!user) redirect("/login");
  if (user.role !== "department") {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  return (
    <DepartmentNotificationsPage
      initialUser={user}
      initialNotifications={notifs.success ? notifs.data : []}
      initialError={notifs.success ? null : notifs.error}
    />
  );
}