"use server";
import { getCurrentUser, type CurrentUser } from "./auth";
import {
  getMyNotifications,
  getPendingApprovals,
  type ApprovalNotification,
  type ApprovalListItem,
} from "./approval-workflow";
import {
  getAdviserAdvisoryGroups,
  getAdviserTotalStudents,
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
export type AdviserDashboardData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;
      groups: AdvisoryGroup[];
      totalStudents: number | null;
      pendingApprovals: ApprovalListItem[];
    }
  | { success: false; error: string };

export async function getAdviserDashboardData(): Promise<AdviserDashboardData> {
  const [user, notifications, groupsResult, studentsResult, pendingResult] =
    await Promise.all([
      getCurrentUser(),
      getMyNotifications(),
      getAdviserAdvisoryGroups(),
      getAdviserTotalStudents(),
      getPendingApprovals(),
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
    pendingApprovals: pendingResult.success ? pendingResult.data : [],
  };
}
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
export type AdviserGroupData =
  | {
      success: true;
      user: CurrentUser;
      unreadCount: number;

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