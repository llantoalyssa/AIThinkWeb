import { redirect } from "next/navigation";

import DepartmentShell from "@/components/department-shell";
import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { rolePath } from "@/lib/constants";

export default async function DepartmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "department" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const permissions = await getGrantedPermissions(user.id);

  return (
    <DepartmentShell user={user} userId={id} permissions={permissions}>
      {children}
    </DepartmentShell>
  );
}
