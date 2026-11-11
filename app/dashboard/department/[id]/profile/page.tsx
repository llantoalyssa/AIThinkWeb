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