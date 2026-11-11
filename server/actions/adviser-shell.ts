"use server";

// ============================================================
// Adviser shell — ONE round trip per page.
//
// Why this exists: every adviser page used to fire several server
// actions on mount (identity + groups + students + notifications +
// pending approvals). Server actions are QUEUED, so N calls cost N
// sequential browser round trips, and that queue was the bulk of the
// click-to-content delay (the group page was the worst: 5 queued calls,
// ~3s before anything appeared). Composing them HERE keeps the client to
// a single request; the queries inside still run in parallel — but
// server-side, where each is a short DB hop rather than a
// client → server → client cycle.
//
// Student equivalent lives in ./shell-data.ts (owned separately).
// ============================================================

import { getCurrentUser, type CurrentUser } from "./auth";
import { getGrantedPermissions } from "./permissions";
import {
  getMyNotifications,
  getPendingApprovals,
  type ApprovalNotification,
  type ApprovalListItem,
} from "./approval-workflow";
import {
  getAdviserAdvisoryGroups,
  getAdviserTotalStudents,
  getGroupMemberCounts,
  getGroupPendingCounts,
  getAdviserGroupBySlug,
  getAdviserGroupStudents,
  type AdvisoryGroup,
  type GroupStudent,
} from "./advisory-groups";
import {
  getGroupSubmissions,
  getSubmissionById,
  type GroupSubmission,
  type SubmissionWithAnalysis,
} from "./group-submissions";

// ── Dashboard (/dashboard/adviser/[id]) ──────────────────────
// Was: getCurrentUser → then Promise.all(groups, students, pending, notifs)
// = 1 + 4 queued browser round trips. Now: 1, with all five queries
// running in parallel server-side.
export type AdviserDashboardData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;
      groups: AdvisoryGroup[];
      totalStudents: number | null;
      /** Joined-student count per group id, for the cards. */
      memberCounts: Record<string, number>;
      /** Pending-TAF count per group id, for the cards' badges. */
      pendingByGroup: Record<string, number>;
      pendingApprovals: ApprovalListItem[];
      /**
       * The permission keys this account effectively holds. The adviser's side
       * nav is built from them: every granted page (Research Analytics,
       * Approved TAF, Journals, Audit Trail) is an item, and without the list
       * those grants appeared nowhere.
       */
      permissions: string[];
    }
  | { success: false; error: string };

export async function getAdviserDashboardData(): Promise<AdviserDashboardData> {
  // Identity first is unnecessary here: every one of these re-authenticates
  // internally, so all six can go out together.
  const [
    user,
    notifications,
    groupsResult,
    studentsResult,
    pendingResult,
    memberCountsResult,
    pendingGroupsResult,
  ] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
    getAdviserAdvisoryGroups(),
    getAdviserTotalStudents(),
    getPendingApprovals(),
    getGroupMemberCounts(),
    getGroupPendingCounts(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    unreadCount: notifications.success
      ? notifications.data.filter((n) => !n.readAt).length
      : 0,
    groups: groupsResult.success ? groupsResult.data : [],
    totalStudents: studentsResult.success ? studentsResult.count : null,
    memberCounts: memberCountsResult.success ? memberCountsResult.counts : {},
    pendingByGroup: pendingGroupsResult.success ? pendingGroupsResult.counts : {},
    pendingApprovals: pendingResult.success ? pendingResult.data : [],
    // The keys this account holds — the side nav needs them to show a granted
    // page (Research Analytics / Approved TAF / Journals / Audit Trail). One
    // extra server-side hop inside the SAME request, never a browser round trip.
    permissions: await getGrantedPermissions(user.id),
  };
}


// ── Notifications (/dashboard/adviser/[id]/notifications) ────
// Was: 1 + 2 queued round trips. Now: 1.
export type AdviserNotificationsData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;
      notifications: ApprovalNotification[];
      pendingApprovals: ApprovalListItem[];
      notificationsError: string | null;
      pendingError: string | null;
    }
  | { success: false; error: string };

export async function getAdviserNotificationsData(): Promise<AdviserNotificationsData> {
  const [user, notifications, pending] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
    getPendingApprovals(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  const list = notifications.success ? notifications.data : [];

  return {
    success: true,
    user,
    unreadCount: list.filter((n) => !n.readAt).length,
    notifications: list,
    pendingApprovals: pending.success ? pending.data : [],
    notificationsError: notifications.success ? null : notifications.error,
    pendingError: pending.success ? null : pending.error,
  };
}

// ── Group detail (/dashboard/adviser/[id]/group/[slug]) ──────
// Used by the SERVER page (see app/dashboard/adviser/[id]/group/[slug]).
// Was: 5 queued browser round trips (identity, unread, group-by-slug, then
// students + submissions). Now: zero — this runs before the RSC payload
// is sent.
export type AdviserGroupData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;
      /** null when the slug matches no group for this adviser. */
      group: AdvisoryGroup | null;
      students: GroupStudent[];
      submissions: GroupSubmission[];
    }
  | { success: false; error: string };

export async function getAdviserGroupData(
  slug: string
): Promise<AdviserGroupData> {
  const [user, notifications, groupResult] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
    getAdviserGroupBySlug(slug),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  const unreadCount = notifications.success
    ? notifications.data.filter((n) => !n.readAt).length
    : 0;

  if (!groupResult.success) {
    return {
      success: true,
      user,
      unreadCount,
      group: null,
      students: [],
      submissions: [],
    };
  }

  // Students + submissions both only need the group id — parallel.
  const [studentsResult, submissionsResult] = await Promise.all([
    getAdviserGroupStudents(groupResult.data.id),
    getGroupSubmissions(groupResult.data.id),
  ]);

  return {
    success: true,
    user,
    unreadCount,
    group: groupResult.data,
    students: studentsResult.success ? studentsResult.data : [],
    submissions: submissionsResult.success ? submissionsResult.data : [],
  };
}

// ── Submission review (/dashboard/adviser/[id]/group/[slug]/submission/[id])
// Was: 1 + 1 + 1 queued round trips (identity, submission, unread). Now: 1.
export type AdviserSubmissionData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;
      submission: SubmissionWithAnalysis | null;
      submissionError: string | null;
    }
  | { success: false; error: string };

export async function getAdviserSubmissionData(
  submissionId: string
): Promise<AdviserSubmissionData> {
  const [user, notifications, submissionResult] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
    getSubmissionById(submissionId),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    unreadCount: notifications.success
      ? notifications.data.filter((n) => !n.readAt).length
      : 0,
    submission: submissionResult.success ? submissionResult.data : null,
    submissionError: submissionResult.success ? null : submissionResult.error,
  };
}
