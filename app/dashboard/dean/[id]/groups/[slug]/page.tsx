

import { redirect } from "next/navigation";
import { getAdviserGroupData } from "@/server/actions/adviser-shell";
import { rolePath } from "@/lib/constants";
import AdvisoryGroupDetailPage from "../../../../adviser/[id]/group/[slug]/group-detail-client";

export default async function DeanGroupDetailPage({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  const data = await getAdviserGroupData(slug);

  if (!data.success) redirect("/login");
  if (data.user.role !== "dean") {
    redirect(`${rolePath(data.user.role)}/${data.user.id}`);
  }
  if (data.user.id !== id) {
    redirect(`/dashboard/dean/${data.user.id}/groups/${slug}`);
  }
  if (!data.group) redirect(`/dashboard/dean/${data.user.id}?tab=groups`);

  return (
    <AdvisoryGroupDetailPage
      initialUser={data.user}
      initialUnreadCount={data.unreadCount}
      initialGroup={data.group}
      initialStudents={data.students}
      initialSubmissions={data.submissions}
      basePath="/dashboard/dean"
    />
  );
}
