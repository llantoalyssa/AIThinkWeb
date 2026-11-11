// ============================================================
// Department → Profile — SERVER entry point.
//
// Identity and the account's EFFECTIVE permission set are resolved HERE, so the
// client half renders the filtered nav from the first paint: the department
// obeys the same permission set as every other role (see navItemsFor), and
// rendering the nav before the grants arrive would flash every item first.
//
// The guards match the other department routes: the ROLE decides, not the URL
// id, and the id the nav links are built from is the CALLER'S own.
// ============================================================

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { rolePath } from "@/lib/constants";
import DepartmentProfileClient from "./profile-client";

export default async function DepartmentProfileRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "department") {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const permissions = await getGrantedPermissions(user.id);

  return <DepartmentProfileClient userId={user.id} permissions={permissions} />;
}
