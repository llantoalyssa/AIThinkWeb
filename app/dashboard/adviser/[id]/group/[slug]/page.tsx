import { redirect } from "next/navigation";
import { getAdviserGroupData } from "@/server/actions/adviser-shell";
import GroupDetailClient from "./group-detail-client";

export default async function AdviserGroupDetailPage({
  params,
}: {

  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  const data = await getAdviserGroupData(slug);
  if (!data.success) redirect("/login");
  if (data.user.role !== "adviser") {
    redirect(`/dashboard/${data.user.role}/${data.user.id}`);
  }
  if (data.user.id !== id) {
    redirect(`/dashboard/adviser/${data.user.id}/group/${slug}`);
  }
  if (!data.group) redirect(`/dashboard/adviser/${data.user.id}`);

  return (
    <GroupDetailClient
      initialUser={data.user}
      initialUnreadCount={data.unreadCount}
      initialGroup={data.group}
      initialStudents={data.students}
      initialSubmissions={data.submissions}
    />
  );
}