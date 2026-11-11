"use server";


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
