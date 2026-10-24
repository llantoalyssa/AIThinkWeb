// ============================================================
// Student notifications — SERVER entry point.
//
// The client page used to fetch identity and then the notification list, one
// queued server action after the other. Both are resolved in parallel HERE and
// ship with the first render, so opening this page costs zero data round trips.
//
// Note the guards are deliberately the same as before: this route checked the
// role, not the URL id.
// ============================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyNotifications } from "@/server/actions/approval-workflow";
import { rolePath } from "@/lib/constants";
import StudentNotificationsPage from "./notifications-client";

export default async function StudentNotificationsRoute() {
  const [user, notifs] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
  ]);

  if (!user) redirect("/login");
  if (user.role !== "student") {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  return (
    <StudentNotificationsPage
      initialUser={user}
      initialNotifications={notifs.success ? notifs.data : []}
      initialError={notifs.success ? null : notifs.error}
    />
  );
}
