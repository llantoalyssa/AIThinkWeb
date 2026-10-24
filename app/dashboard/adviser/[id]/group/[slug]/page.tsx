// ============================================================
// Adviser advisory-group detail — SERVER entry point.
//
// Everything this page shows is fetched HERE, in parallel, and ships with the
// first render: identity, the unread badge, the group, its roster and its
// submissions (two DB stages — the roster and the submissions both need the
// group id).
//
// It used to be a client page that fired FIVE separate server actions on
// mount — and because server actions are queued, those ran one after another,
// making this the slowest navigation in the adviser dashboard (~3s before data
// appeared). Now it costs zero data round trips: the content arrives with the
// RSC payload for the route.
// ============================================================

import { redirect } from "next/navigation";
import { getAdviserGroupData } from "@/server/actions/adviser-shell";
import GroupDetailClient from "./group-detail-client";

export default async function AdviserGroupDetailPage({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  const data = await getAdviserGroupData(slug);

  // Access checks live here now (see middleware for the URL-id guard).
  if (!data.success) redirect("/login");
  if (data.user.role !== "adviser") {
    redirect(`/dashboard/${data.user.role}/${data.user.id}`);
  }
  if (data.user.id !== id) {
    redirect(`/dashboard/adviser/${data.user.id}/group/${slug}`);
  }
  // No group matches this slug for this adviser — same destination the old
  // client-side branch pushed to.
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
