"use server";
import { getCurrentUser, type CurrentUser } from "./auth";
import {
  getMyNotifications,
  getPendingApprovals,
  getApprovedTAFs,
  type ApprovalNotification,
  type ApprovalListItem,
} from "./approval-workflow";
import {
  getSubmissionById,
  type SubmissionWithAnalysis,
} from "./group-submissions";
import { getResearchAnalytics, type AnalyticsData } from "./research-analytics";
import { getExecutiveSummary, type ExecutiveSummaryData } from "./executive-summary";
import { getAllUsers, type DepartmentUser } from "./department";
import { getAllJournals, type Journal } from "./journals";
import { listAllFeedback, type FeedbackItem } from "./feedback";

export type ApproverRole = "associate_dean" | "dean" | "vcrdes";

export type ApproverShell =
  | {
      success: true;
      user: CurrentUser;
      notifications: ApprovalNotification[];
      unreadCount: number;
      pending: ApprovalListItem[];
      approved: ApprovalListItem[];
      analytics: AnalyticsData | null;
      executiveSummary: ExecutiveSummaryData | null;
    }
  | { success: false; error: string };

export async function getApproverShell(role: ApproverRole): Promise<ApproverShell> {
  const [user, notifications, pending, approved, analytics, executiveSummary] =
    await Promise.all([
      getCurrentUser(),
      getMyNotifications(),
      getPendingApprovals(),
      getApprovedTAFs(),
      getResearchAnalytics(),
      role === "dean" ? getExecutiveSummary() : Promise.resolve(null),
    ]);

  if (!user) return { success: false, error: "You must be logged in." };

  const notifs = notifications.success ? notifications.data : [];

  return {
    success: true,
    user,
    notifications: notifs,
    unreadCount: notifs.filter((n) => !n.readAt).length,
    pending: pending.success ? pending.data : [],
    approved: approved.success ? approved.data : [],
    analytics: analytics.success ? analytics.data : null,
    executiveSummary:
      executiveSummary && executiveSummary.success ? executiveSummary.data : null,
  };
}

export type ApproverSubmissionShell =
  | {
      success: true;
      user: CurrentUser;
      submission: SubmissionWithAnalysis;

      pendingCount: number;
    }
  | { success: false; error: string; unauthenticated?: boolean };
export async function getApproverSubmissionShell(
  submissionId: string,
): Promise<ApproverSubmissionShell> {
  const [user, submission, pending] = await Promise.all([
    getCurrentUser(),
    getSubmissionById(submissionId),
    getPendingApprovals(),
  ]);

  if (!user) {
    return { success: false, error: "You must be logged in.", unauthenticated: true };
  }
  if (!submission.success) {
    return { success: false, error: submission.error };
  }

  return {
    success: true,
    user,
    submission: submission.data,
    pendingCount: pending.success ? pending.data.length : 0,
  };
}

export type ApproverNotificationsShell =
  | {
      success: true;
      user: CurrentUser;
      notifications: ApprovalNotification[];

      notificationsError: string | null;
    }
  | { success: false; error: string };

export async function getApproverNotificationsShell(): Promise<ApproverNotificationsShell> {

  const [user, notifications] = await Promise.all([
    getCurrentUser(),
    getMyNotifications(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    notifications: notifications.success ? notifications.data : [],
    notificationsError: notifications.success ? null : notifications.error,
  };
}

export type DepartmentShell =
  | {
      success: true;
      user: CurrentUser;
      users: DepartmentUser[];
      usersError: string | null;
      journals: Journal[] | null;

      feedback: FeedbackItem[] | null;
    }
  | { success: false; error: string };

export async function getDepartmentShell(): Promise<DepartmentShell> {
  const [user, users, journals, feedback] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getAllJournals(),
    listAllFeedback(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    users: users.success ? users.data : [],
    usersError: users.success ? null : users.error,
    journals: journals.success ? journals.data : null,
    feedback: feedback.success ? feedback.data : null,
  };
}