"use server";

// ============================================================
// Approver / Department shells — ONE round trip for the pieces
// their dashboards need before they can render.
//
// Why this exists: these pages used to fire several server actions on
// mount (getCurrentUser + pending approvals + approved TAFs + the landing
// tab's analytics + the notification bell's list). Server actions are
// QUEUED, so N separate calls cost N round trips in sequence — measured as
// the bulk of the time between a side-nav click and data appearing.
// Composing them HERE keeps the client to a single request; the queries
// inside still run in parallel, but server-side, where each is a short DB
// hop rather than a client → server → client cycle.
//
// Mirrors server/actions/shell-data.ts (getStudentShell) for the approver
// and department surfaces.
// ============================================================

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
      /** Research Analytics payload (the Associate Dean / VCRDES landing tab;
       *  also an optional tab for the Dean). Null when the query failed — the
       *  component then falls back to fetching it itself. */
      analytics: AnalyticsData | null;
      /** Executive Summary payload (the DEAN's landing tab only — no other
       *  role renders it). Null when unavailable. */
      executiveSummary: ExecutiveSummaryData | null;
      /**
       * The permission keys this account EFFECTIVELY holds. The side nav needs
       * them to surface a granted department page (e.g. "pages.feedback") as an
       * item; with none granted the nav renders exactly as it always has.
       * Resolved by the same reader as public.has_permission(), and returned
       * with this shell so the client pays no second round trip for it.
       */
      permissions: string[];
      /**
       * `submissionId → group slug` for the notifications above that belong to a
       * group THIS caller owns. The bell's href builder is synchronous, so the
       * ownership it needs is resolved here, WITH the notifications — that is
       * what makes the bell and the notifications page send the same
       * notification to the same destination. Empty map → every notification
       * keeps the flat destination it has always had.
       */
      ownedGroupSlugs: Record<string, string>;
    }
  | { success: false; error: string };

export async function getApproverShell(role: ApproverRole): Promise<ApproverShell> {
  // Parallel on the server: one auth check + the queue/badge queries + the
  // landing tab's data, instead of five authenticated round trips from the
  // browser, one after another.
  //
  // Executive Summary is only fetched for the Dean because it is the only
  // role whose dashboard renders that tab (see ApproverDashboard's
  // isExecutiveRole / default-tab logic).
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

  // The permission set is resolved AFTER the identity is known (it is keyed by
  // user id), so it is one extra server-side hop inside this SAME request —
  // never a second round trip from the browser.
  const permissions = await getGrantedPermissions(user.id);

  const notifs = notifications.success ? notifications.data : [];

  // Which of THOSE notifications are submissions in a group this caller owns —
  // resolved with them, so the bell can route a click exactly like the
  // notifications page does without an async click handler.
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
      /** Pending count for the sidebar badge (same number the dashboard shows). */
      pendingCount: number;
      /**
       * Comment threads for this submission, fetched with the rest of the shell
       * so the comment badge is correct on the FIRST paint. Null when the
       * viewer may not see them.
       */
      annotations: Annotation[] | null;
      canComment: boolean;
      /**
       * The permission keys this account effectively holds — the review page
       * renders the SAME side nav as the dashboard, so it needs the same grants
       * or a granted page item would vanish when a TAF is opened.
       */
      permissions: string[];
    }
  | { success: false; error: string; unauthenticated?: boolean };

/**
 * Everything the shared approver submission-review page needs, in ONE call.
 *
 * It used to chain on mount: getCurrentUser → getSubmissionById → AWAITED
 * markNotificationsRead → a separate getPendingApprovals effect. Server actions
 * are queued, so that was four authenticated round trips before the page left
 * its spinner, and the submission payload is the heaviest one in the app —
 * opening a pending/approved TAF took 5-8s.
 */
export async function getApproverSubmissionShell(
  submissionId: string,
): Promise<ApproverSubmissionShell> {
  // Four things at once instead of in sequence — the review page used to pay
  // for its comment threads only after it had already opened.
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
      /** The keys this account effectively holds (drives access + the nav). */
      permissions: string[];
      /**
       * True when the account may read feedback. False is a normal outcome for
       * a direct visit by an ungranted account — the page shows a short notice
       * instead of the list (and the list action + RLS would refuse it anyway).
       */
      canView: boolean;
    }
  | { success: false; error: string };

/** The Feedback page's shell: identity + the permission set, one request. */
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
      /** Non-null when the notifications query failed (the page shows it). */
      notificationsError: string | null;
      /**
       * The keys this account effectively holds. The notifications page renders
       * the SAME side nav as the rest of the role, so it needs the same grants
       * or a granted page item would disappear on this one surface.
       */
      permissions: string[];
    }
  | { success: false; error: string };

export async function getApproverNotificationsShell(): Promise<ApproverNotificationsShell> {
  // ONE call instead of getCurrentUser() → getMyNotifications() in sequence.
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
      /**
       * `submissionId → group slug` for the notifications that belong to a group
       * the caller OWNS. Always `{}` unless the caller asked for it — the
       * student / adviser / department bells pass no flag, so they pay nothing
       * extra and keep their current destinations.
       */
      ownedGroupSlugs: Record<string, string>;
    }
  | { success: false; error: string };

/**
 * The shared notification BELL's own load — the notification list plus, when
 * asked, the owned-group map its synchronous href builder needs.
 *
 * `includeOwnedGroups` is opt-in because the bell is mounted by every role: an
 * approver surface sets it to route an owned-group submission the same way the
 * notifications page does, and everyone else keeps the plain list they had.
 */
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

/**
 * What a PROFILE page needs to build the role's nav: identity + the effective
 * permission keys. One request, so the profile page renders the same item list
 * as the rest of its role (a granted page item included) instead of a copy of
 * the nav that could not see the grants.
 */
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
      /**
       * The permission keys this account EFFECTIVELY holds. The department
       * obeys the same permission set as every other role, so its side nav is
       * FILTERED by these (and its in-page sections gated). Returned with this
       * shell so the client pays no second round trip for it.
       */
      permissions: string[];
      users: DepartmentUser[];
      usersError: string | null;
      /** Null when the journals query failed — the child then fetches its own
       *  list (and shows its own error banner) exactly as before. */
      journals: Journal[] | null;
      /** Same fallback contract as `journals`. */
      feedback: FeedbackItem[] | null;
      /**
       * The permission layer's static data (catalogue + every role's defaults)
       * AND every account's override rows, PRELOADED with the page.
       *
       * The Users dialog needs all of it before it can draw a single checkbox.
       * It used to be fetched when Edit was clicked (and in two follow-up calls
       * after this shell), so the boxen painted unchecked for a beat and the
       * dialog looked like it had lost the account's access. One payload with
       * the page means the dialog is correct on its first paint and opening it
       * costs no round trip.
       */
      permissionConsole: PermissionConsoleData;
    }
  | { success: false; error: string };

export async function getDepartmentShell(): Promise<DepartmentShell> {
  // The department dashboard's own auth + user list, plus the two tab panels'
  // first payloads — one request instead of a chain of them per tab.
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
    // Keyed by user id, so it is resolved AFTER the identity is known — one
    // extra server-side hop inside this SAME request, never a browser round trip.
    permissions: await getGrantedPermissions(user.id),
    users: users.success ? users.data : [],
    usersError: users.success ? null : users.error,
    journals: journals.success ? journals.data : null,
    feedback: feedback.success ? feedback.data : null,
    permissionConsole,
  };
}

// ── Read-only page-permission routes ───────────────────────────────────────

export type ApproverPageShell =
  | {
      success: true;
      user: CurrentUser;
      /** The keys this account EFFECTIVELY holds, exactly as the nav sees them. */
      permissions: string[];
    }
  | { success: false; error: string };

/**
 * Identity + effective grants for the READ-ONLY page routes a granted approver
 * can open (journals, audit trail). The route itself fetches its data on the
 * server, so this resolves only what the chrome and the page gate need: WITHOUT
 * it, an ungranted account could not be told apart from a granted one before
 * the data query, and the nav would drop the very item that led here.
 *
 * Same pair of reads getApproverFeedbackShell() makes, so the two grant-gated
 * surfaces cannot answer the question differently.
 */
export async function getApproverPageShell(): Promise<ApproverPageShell> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  return {
    success: true,
    user,
    permissions: await getGrantedPermissions(user.id),
  };
}
