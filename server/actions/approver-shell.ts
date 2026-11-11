"use server";
import { getCurrentUser, type CurrentUser } from "./auth";
import {
  getSubmissionAnnotations,
  type Annotation,
} from "./submission-annotations";
import {
  getMyNotifications,
  getPendingApprovals,
  getApprovedTAFs,
  type ApprovalNotification,
  type ApprovalListItem,
} from "./approval-workflow";
import {
  getSubmissionById,
  getOwnedGroupSlugsForSubmissions,
  type SubmissionWithAnalysis,
} from "./group-submissions";
import { getResearchAnalytics, type AnalyticsData } from "./research-analytics";
import { getExecutiveSummary, type ExecutiveSummaryData } from "./executive-summary";
import { getAllUsers, type DepartmentUser } from "./department";
import { getAllJournals, type Journal } from "./journals";
import { listAllFeedback, type FeedbackItem } from "./feedback";
import {
  getGrantedPermissions,
  readPermissionConsoleData,
  type PermissionConsoleData,
} from "./permissions";

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
      permissions: string[];
      ownedGroupSlugs: Record<string, string>;
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
  const permissions = await getGrantedPermissions(user.id);

  const notifs = notifications.success ? notifications.data : [];
  const ownedGroupSlugs = await getOwnedGroupSlugsForSubmissions(
    notifs
      .map((n) => n.submissionId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

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
    permissions,
    ownedGroupSlugs,
  };
}

export type ApproverSubmissionShell =
  | {
      success: true;
      user: CurrentUser;
      submission: SubmissionWithAnalysis;

      pendingCount: number;
      annotations: Annotation[] | null;
      canComment: boolean;
      permissions: string[];
    }
  | { success: false; error: string; unauthenticated?: boolean };
export async function getApproverSubmissionShell(
  submissionId: string,
): Promise<ApproverSubmissionShell> {
  const [user, submission, pending, annotations] = await Promise.all([
    getCurrentUser(),
    getSubmissionById(submissionId),
    getPendingApprovals(),
    getSubmissionAnnotations(submissionId),
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
    annotations: annotations.success ? annotations.data : null,
    canComment: annotations.success ? annotations.canComment : false,
    permissions: await getGrantedPermissions(user.id),
  };
}

export type ApproverFeedbackShell =
  | {
      success: true;
      user: CurrentUser;

      permissions: string[];
      canView: boolean;
    }
  | { success: false; error: string };
export async function getApproverFeedbackShell(): Promise<ApproverFeedbackShell> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const permissions = await getGrantedPermissions(user.id);
  return {
    success: true,
    user,
    permissions,
    canView: permissions.includes("pages.feedback"),
  };
}

export type ApproverNotificationsShell =
  | {
      success: true;
      user: CurrentUser;
      notifications: ApprovalNotification[];

      notificationsError: string | null;
      permissions: string[];
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
    permissions: await getGrantedPermissions(user.id),
  };
}

export type NotificationBellShell =
  | {
      success: true;
      notifications: ApprovalNotification[];
      ownedGroupSlugs: Record<string, string>;
    }
  | { success: false; error: string };
export async function getNotificationBellShell(
  includeOwnedGroups = false,
): Promise<NotificationBellShell> {
  const notifications = await getMyNotifications();
  if (!notifications.success) {
    return { success: false, error: notifications.error };
  }

  const ownedGroupSlugs = includeOwnedGroups
    ? await getOwnedGroupSlugsForSubmissions(
        notifications.data
          .map((n) => n.submissionId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      )
    : {};

  return { success: true, notifications: notifications.data, ownedGroupSlugs };
}

export type ProfileNavShell =
  | { success: true; user: CurrentUser; permissions: string[] }
  | { success: false; error: string };
export async function getProfileNavShell(): Promise<ProfileNavShell> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  return {
    success: true,
    user,
    permissions: await getGrantedPermissions(user.id),
  };
}

export type DepartmentShell =
  | {
      success: true;
      user: CurrentUser;
      permissions: string[];
      users: DepartmentUser[];
      usersError: string | null;
      journals: Journal[] | null;

      feedback: FeedbackItem[] | null;
      permissionConsole: PermissionConsoleData;
    }
  | { success: false; error: string };

export async function getDepartmentShell(): Promise<DepartmentShell> {
  const [user, users, journals, feedback, permissionConsole] = await Promise.all([
    getCurrentUser(),
    getAllUsers(),
    getAllJournals(),
    listAllFeedback(),
    readPermissionConsoleData(),
  ]);

  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    permissions: await getGrantedPermissions(user.id),
    users: users.success ? users.data : [],
    usersError: users.success ? null : users.error,
    journals: journals.success ? journals.data : null,
    feedback: feedback.success ? feedback.data : null,
    permissionConsole,
  };
}
export type ApproverPageShell =
  | {
      success: true;
      user: CurrentUser;

      permissions: string[];
    }
  | { success: false; error: string };
export async function getApproverPageShell(): Promise<ApproverPageShell> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    permissions: await getGrantedPermissions(user.id),
  };
}