"use server";

// ============================================================
// One server action for the whole Advisory Group tab.
//
// The tab used to fire FOUR separate server actions from the browser on mount
// (groups, total students, per-group member counts, per-group pending counts).
// Each is a round trip to the app server, and they only started AFTER the
// dashboard finished loading — so opening the tab felt slow.
//
// This bundles all four into a single round trip. The four queries still run in
// parallel inside the action (same Supabase work), but the browser now waits for
// one request instead of four.
// ============================================================

import {
  getAdviserAdvisoryGroups,
  getAdviserTotalStudents,
  getGroupMemberCounts,
  getGroupPendingCounts,
} from "@/server/actions/advisory-groups";

export type SupervisorGroupsData = {
  groups: Awaited<ReturnType<typeof getAdviserAdvisoryGroups>>;
  students: Awaited<ReturnType<typeof getAdviserTotalStudents>>;
  members: Awaited<ReturnType<typeof getGroupMemberCounts>>;
  pending: Awaited<ReturnType<typeof getGroupPendingCounts>>;
};

export async function getSupervisorGroupsData(): Promise<SupervisorGroupsData> {
  const [groups, students, members, pending] = await Promise.all([
    getAdviserAdvisoryGroups(),
    getAdviserTotalStudents(),
    getGroupMemberCounts(),
    getGroupPendingCounts(),
  ]);
  return { groups, students, members, pending };
}
