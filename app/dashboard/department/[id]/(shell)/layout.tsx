// ============================================================
// Department console — the persistent frame.
//
// WHY A LAYOUT: the header, side nav and mobile drawer used to be rendered by
// EVERY department page, so each sidebar click unmounted the whole chrome and
// rebuilt it from the server render. The result was what the office reported:
// the highlight seemed to lag behind the click, and moving between Admin
// Analytics and Advisory Group took a full page round trip.
//
// A layout renders ONCE for the segment and survives child navigation, so the
// chrome (and its client state: collapsed sidebar, scroll position) persists
// while only the content area changes.
//
// Identity and grants are resolved here instead of in each page: they are what
// the nav needs, and both are memoised per request (React cache), so a page that
// also needs them costs no extra round trip.
// ============================================================

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
