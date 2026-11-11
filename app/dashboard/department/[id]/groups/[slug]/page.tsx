// ============================================================
// Department advisory-group detail.
//
// Same screen an adviser gets — the shared group-detail client with basePath
// pointed at the department routes, so every link, the sidebar and the back
// button stay inside this dashboard. It is the exact shape of the associate
// dean's …/groups/[slug] route.
//
// ONE department-specific difference: where Back goes. The approver roles
// return to ?tab=groups on their dashboard; the department's group list is a
// SECTION of its own console (?section=groups), so backHref is passed
// explicitly instead of letting the client guess a tab URL this role does not
// have.
// ============================================================

import { redirect } from "next/navigation";
import { getAdviserGroupData } from "@/server/actions/adviser-shell";
import { rolePath } from "@/lib/constants";
import AdvisoryGroupDetailPage from "../../../../adviser/[id]/group/[slug]/group-detail-client";

export default async function DepartmentGroupDetailPage({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  const data = await getAdviserGroupData(slug);

  if (!data.success) redirect("/login");
  if (data.user.role !== "department") {
    redirect(`${rolePath(data.user.role)}/${data.user.id}`);
  }
  if (data.user.id !== id) {
    redirect(`/dashboard/department/${data.user.id}/groups/${slug}`);
  }
  // No such group for this department → its group list, never a bare dashboard
  // URL (the landing section there is Users).
  if (!data.group) redirect(`/dashboard/department/${data.user.id}?section=groups`);

  return (
    <AdvisoryGroupDetailPage
      initialUser={data.user}
      initialUnreadCount={data.unreadCount}
      initialGroup={data.group}
      initialStudents={data.students}
      initialSubmissions={data.submissions}
      basePath="/dashboard/department"
      backHref={`/dashboard/department/${id}?section=groups`}
    />
  );
}
