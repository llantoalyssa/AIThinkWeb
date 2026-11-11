// ============================================================
// Department notifications — SERVER entry point.
//
// Mirrors the student route: identity and the notification list are resolved
// in PARALLEL here and ship with the first render, so opening the page costs
// no client data round trips.
// ============================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyNotifications } from "@/server/actions/approval-workflow";
import { getGrantedPermissions } from "@/server/actions/permissions";
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

  // The department obeys the permission set, so its nav is FILTERED by these —
  // resolved here so the page still ships with the first render (no client
  // fetch, no nav flicker).
  const permissions = await getGrantedPermissions(user.id);

  return (
    <DepartmentNotificationsPage
      initialUser={user}
      initialPermissions={permissions}
      initialNotifications={notifs.success ? notifs.data : []}
      initialError={notifs.success ? null : notifs.error}
    />
  );
}
