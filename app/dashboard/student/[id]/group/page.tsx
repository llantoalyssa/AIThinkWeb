// ============================================================
// Student advisory group — SERVER entry point.
//
// A student who has ALREADY joined a group must never be shown the
// group list. This route used to render a client page that fetched
// membership and then did a `router.replace` into the group — so the
// student saw an intermediate loading/list page before landing on
// their group.
//
// The membership check now happens on the SERVER, so the redirect is
// issued before any UI is sent: click "Advisory Group" and you land
// directly on /group/<your group>.
//
// A student with NO group still gets the join-code form (client).
// ============================================================

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actions/auth";
import { getStudentJoinedGroups } from "@/server/actions/advisory-groups";
import { groupSlug } from "@/lib/slug";
import GroupClient from "./group-client";

export default async function StudentGroupEntryPage({
  params,
}: {
  // Next 15: route params are async.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (user?.role === "student") {
    const result = await getStudentJoinedGroups();
    if (result.success && result.data.length > 0) {
      // Straight into the (first) joined group — no list, no spinner page.
      redirect(
        `/dashboard/student/${id}/group/${groupSlug(result.data[0].groupName)}`,
      );
    }
  }

  return <GroupClient />;
}
